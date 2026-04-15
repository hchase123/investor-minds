#!/usr/bin/env python3
"""
ingest_letters.py

Reads data/letters/*.txt and inserts each letter into the investor-minds-public
Supabase project:
  - raw_sources: full letter text
  - thoughts:    summary paragraph + metadata, FK → raw_sources

Usage:
    python3 scripts/ingest_letters.py              # insert rows, skip embeddings
    python3 scripts/ingest_letters.py --embed      # also generate embeddings (needs OPENAI_API_KEY)
    python3 scripts/ingest_letters.py --dry-run    # print what would be inserted, no DB writes

Environment (loaded from .env.local if present):
    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY   (or SUPABASE_SERVICE_ROLE_KEY for write access)
    OPENAI_API_KEY                  (only required with --embed)
"""

import argparse
import hashlib
import json
import os
import sys
import textwrap
from pathlib import Path

# ---------------------------------------------------------------------------
# Load .env.local if present
# ---------------------------------------------------------------------------
ENV_PATH = Path(__file__).parent.parent / ".env.local"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

DATA_DIR = Path(__file__).parent.parent / "data" / "letters"
MANIFEST_PATH = DATA_DIR / "manifest.json"

# Summary: first N words of the letter used as the `content` field on thoughts
SUMMARY_WORDS = 200


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def first_words(text: str, n: int) -> str:
    """Return the first n words, cleaned up."""
    words = text.split()[:n]
    return " ".join(words)


def generate_embedding(text: str, client) -> list[float] | None:
    """Generate a 1536-dim embedding via OpenAI text-embedding-3-small."""
    try:
        resp = client.embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],  # stay well under 8191-token limit
        )
        return resp.data[0].embedding
    except Exception as e:
        print(f"    WARNING: embedding failed — {e}", file=sys.stderr)
        return None


def ingest(args):
    # Late imports so --dry-run works without all deps installed
    from supabase import create_client

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.")
        sys.exit(1)

    openai_client = None
    if args.embed:
        if not OPENAI_API_KEY:
            print("ERROR: OPENAI_API_KEY must be set to use --embed")
            sys.exit(1)
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)

    if not args.dry_run:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    manifest = json.loads(MANIFEST_PATH.read_text())
    entries = sorted(manifest.values(), key=lambda x: str(x.get("year", "0")))

    print(f"Ingesting {len(entries)} letters into {SUPABASE_URL}…")
    if args.dry_run:
        print("  (DRY RUN — no writes)\n")

    inserted = 0
    skipped = 0

    for entry in entries:
        year = entry["year"]
        author = entry["author"]
        mind_slug = entry["mind_slug"]
        txt_path = Path(__file__).parent.parent / entry["file"]

        if not txt_path.exists():
            print(f"  SKIP {year}: file not found ({txt_path})")
            skipped += 1
            continue

        full_text = txt_path.read_text(encoding="utf-8")
        fp = fingerprint(full_text)

        # Dedup: check if raw_source with this fingerprint already exists
        if not args.dry_run:
            existing = (
                sb.table("raw_sources")
                .select("id")
                .eq("content_fingerprint", fp)
                .execute()
            )
            if existing.data:
                print(f"  SKIP {year}: already ingested (fingerprint match)")
                skipped += 1
                continue

        summary = first_words(full_text, SUMMARY_WORDS)
        slug_key = f"{mind_slug}-{year}" if mind_slug == "munger" else str(year)

        raw_source_row = {
            "source_type": "book",
            "content": full_text,
            "content_fingerprint": fp,
            "metadata": {
                "author": author,
                "mind_slug": mind_slug,
                "year": year,
                "slug": slug_key,
                "word_count": entry["word_count"],
                "char_count": entry["char_count"],
                "pdf_pages": f"{entry['start_page']}–{entry['end_page']}",
            },
        }

        thought_row = {
            "content": summary,
            "source_type": "book",
            "author": author,
            "mind_slug": mind_slug,
            "year": year if isinstance(year, int) else int(str(year).split("-")[-1]),
            "metadata": {
                "slug": slug_key,
                "title": f"{author} ({year}) — Berkshire Hathaway Shareholder Letter"
                         if mind_slug == "buffett"
                         else f"Charlie Munger (2014) — Vice Chairman's Thoughts",
                "source_type": "book",
                "word_count": entry["word_count"],
            },
        }

        # Generate embedding on the summary (cheaper, still captures key ideas)
        if args.embed and openai_client:
            embedding = generate_embedding(summary, openai_client)
            if embedding:
                thought_row["embedding"] = embedding

        if args.dry_run:
            print(f"  WOULD INSERT {slug_key}: {entry['word_count']:,} words, "
                  f"embed={'yes' if args.embed else 'no'}")
            inserted += 1
            continue

        # Insert raw_source first to get its ID
        rs_resp = sb.table("raw_sources").insert(raw_source_row).execute()
        if not rs_resp.data:
            print(f"  ERROR inserting raw_source for {year}", file=sys.stderr)
            skipped += 1
            continue

        raw_source_id = rs_resp.data[0]["id"]
        thought_row["id"] = None  # let Supabase generate UUID
        # Remove None to avoid sending null id
        thought_row = {k: v for k, v in thought_row.items() if v is not None}

        # Link thought → raw_source via thought_id on raw_sources isn't the FK we want.
        # The FK is raw_sources.thought_id → thoughts.id, so insert thought first.
        t_resp = sb.table("thoughts").insert(thought_row).execute()
        if not t_resp.data:
            print(f"  ERROR inserting thought for {year}", file=sys.stderr)
            skipped += 1
            continue

        thought_id = t_resp.data[0]["id"]

        # Back-link raw_source to thought
        sb.table("raw_sources").update({"thought_id": thought_id}).eq("id", raw_source_id).execute()

        print(f"  ✓ {slug_key}  ({entry['word_count']:,} words)"
              + ("  [embedded]" if args.embed and "embedding" in thought_row else ""))
        inserted += 1

    print(f"\nDone. {inserted} inserted, {skipped} skipped.")
    if not args.embed:
        print("Tip: run with --embed (and OPENAI_API_KEY set) to add vector embeddings.")


def main():
    parser = argparse.ArgumentParser(description="Ingest BH letters into Supabase")
    parser.add_argument("--embed", action="store_true",
                        help="Generate vector embeddings via OpenAI (requires OPENAI_API_KEY)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be inserted without writing to DB")
    args = parser.parse_args()
    ingest(args)


if __name__ == "__main__":
    main()
