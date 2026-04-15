#!/usr/bin/env python3
"""
ingest_pg.py

Ingests Paul Graham's essays from the Paul_Graham/ folder into the
investor-minds-public Supabase project.

Each PDF → one raw_sources row (full text) + one thoughts row (summary).

Usage:
    python3 scripts/ingest_pg.py             # ingest all
    python3 scripts/ingest_pg.py --dry-run   # preview without writing

Environment (loaded from site/.env.local):
    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
"""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

# ---------------------------------------------------------------------------
# Load env
# ---------------------------------------------------------------------------
ENV_PATH = Path(__file__).parent.parent / "site" / ".env.local"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

PG_DIR = Path(
    "/Users/hchase/Library/CloudStorage/Dropbox/2.LIFE/40-49 Resources"
    "/45 People/Investors/Paul_Graham"
)

MIND_SLUG = "paul-graham"
AUTHOR = "Paul Graham"


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def slug_from_filename(name: str) -> str:
    # e.g. "021_why_nerds_are_unpopular" → "why-nerds-are-unpopular"
    name = re.sub(r"^\d+_", "", name)          # strip leading number
    name = name.replace("_", "-").lower()
    name = re.sub(r"[^a-z0-9-]", "", name)
    return f"pg-{name}"


def title_from_filename(name: str) -> str:
    name = re.sub(r"^\d+_", "", name)
    return name.replace("_", " ").title()


def extract_text(pdf_path: Path) -> str:
    try:
        doc = fitz.open(str(pdf_path))
        return "\n\n".join(page.get_text() for page in doc).strip()
    except Exception as e:
        print(f"  WARNING: could not extract {pdf_path.name}: {e}", file=sys.stderr)
        return ""


def ingest(args):
    from supabase import create_client

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Supabase env vars not set.")
        sys.exit(1)

    if not args.dry_run:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    pdfs = sorted(PG_DIR.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDFs in {PG_DIR.name}/")
    if args.dry_run:
        print("  (DRY RUN — no writes)\n")

    inserted = skipped = errors = 0

    for pdf in pdfs:
        stem = pdf.stem  # e.g. "021_why_nerds_are_unpopular"
        slug = slug_from_filename(stem)
        title = title_from_filename(stem)

        text = extract_text(pdf)
        if not text:
            errors += 1
            continue

        fp = fingerprint(text)
        # First ~200 words as the summary stored in thoughts.content
        summary = " ".join(text.split()[:200])

        if args.dry_run:
            print(f"  WOULD INSERT  {slug}  ({len(text.split()):,} words)")
            inserted += 1
            continue

        # Dedup
        existing = sb.table("raw_sources").select("id").eq("content_fingerprint", fp).execute()
        if existing.data:
            skipped += 1
            continue

        # Insert thought first (get UUID), then raw_source back-linked
        thought_resp = sb.table("thoughts").insert({
            "content": summary,
            "source_type": "essay",
            "author": AUTHOR,
            "mind_slug": MIND_SLUG,
            "metadata": {
                "slug": slug,
                "title": title,
                "word_count": len(text.split()),
                "source_file": pdf.name,
            },
        }).execute()

        if not thought_resp.data:
            print(f"  ERROR inserting thought for {slug}", file=sys.stderr)
            errors += 1
            continue

        thought_id = thought_resp.data[0]["id"]

        sb.table("raw_sources").insert({
            "thought_id": thought_id,
            "source_type": "essay",
            "content": text,
            "content_fingerprint": fp,
            "metadata": {"slug": slug, "title": title, "author": AUTHOR},
        }).execute()

        print(f"  ✓  {slug}  ({len(text.split()):,} words)")
        inserted += 1

    print(f"\nDone. {inserted} inserted, {skipped} skipped, {errors} errors.")


def main():
    parser = argparse.ArgumentParser(description="Ingest Paul Graham essays into Supabase")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    ingest(args)


if __name__ == "__main__":
    main()
