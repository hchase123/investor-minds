#!/usr/bin/env python3
"""
compile_concepts.py

Reads raw essay text from Supabase raw_sources, uses Claude Haiku to extract
concepts, then writes merged concept pages to wiki_articles.

Usage:
    python3 scripts/compile_concepts.py --mind paul-graham
    python3 scripts/compile_concepts.py --mind paul-graham --limit 10   # first 10 essays only
    python3 scripts/compile_concepts.py --mind paul-graham --dry-run

Environment (from site/.env.local):
    ANTHROPIC_API_KEY
    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from collections import defaultdict

import anthropic
from supabase import create_client

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
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

MODEL = "claude-haiku-4-5-20251001"
BATCH_SIZE = 5  # essays per LLM call


EXTRACT_PROMPT = """\
You are building a public knowledge graph from {author}'s writing.

Below are {n} essays. For each essay, extract the key concepts — the durable ideas worth linking to and exploring.

Rules:
- Extract 3-7 concepts per essay (fewer for short essays, more for long ones)
- Each concept should be a standalone idea, principle, or mental model — not a summary of the essay
- Concepts should be general enough to appear in multiple essays (that's what makes a graph)
- slug: kebab-case, 2-4 words, globally unique across all essays (e.g. "default-alive", "maker-schedule", "do-things-that-dont-scale")
- title: Title Case, human-readable
- summary: one sentence definition (≤20 words)
- content: 2-4 paragraph explanation with specific examples and quotes from the essays. Use [[Concept Title]] wikilink syntax to reference other concepts you've extracted.
- tags: 2-4 topic tags (e.g. "startups", "writing", "thinking", "programming")
- source_essay: the essay slug this concept came from (e.g. "pg-default-alive")
- wikilinks: list of concept slugs this concept links to (must be slugs of other concepts you're extracting in this batch or that obviously exist)

Return a JSON array of concept objects. No markdown, no explanation — just the JSON array.

Essays:
{essays}"""


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text[:80]


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def fetch_essays(sb, mind_slug: str, limit: int | None) -> list[dict]:
    AUTHOR_MAP = {
        "paul-graham": "Paul Graham",
        "buffett": "Warren Buffett",
        "munger": "Charlie Munger",
    }
    author = AUTHOR_MAP.get(mind_slug, mind_slug.replace("-", " ").title())

    # raw_sources for PG essays don't have mind_slug in metadata (bug in ingest_pg.py)
    # so filter by author instead; future ingests will include mind_slug
    q = (
        sb.table("raw_sources")
        .select("id, thought_id, content, metadata")
        .filter("metadata->>author", "eq", author)
        .order("id")
    )
    if limit:
        q = q.limit(limit)
    resp = q.execute()
    return resp.data or []


def extract_concepts_batch(client: anthropic.Anthropic, essays: list[dict], author: str) -> list[dict]:
    essays_text = ""
    for e in essays:
        meta = e.get("metadata", {})
        slug = meta.get("slug", "unknown")
        title = meta.get("title", slug)
        # Truncate very long essays to ~6k words to stay within context
        words = e["content"].split()
        body = " ".join(words[:3000])
        if len(words) > 3000:
            body += "\n[truncated]"
        essays_text += f"\n\n---\nESSAY SLUG: {slug}\nTITLE: {title}\n\n{body}"

    prompt = EXTRACT_PROMPT.format(
        author=author,
        n=len(essays),
        essays=essays_text,
    )

    try:
        msg = client.messages.create(
            model=MODEL,
            max_tokens=8096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        # Strip markdown code fences if present
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        concepts = json.loads(raw)
        return concepts if isinstance(concepts, list) else []
    except json.JSONDecodeError as e:
        print(f"  WARNING: JSON parse error in batch — {e}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"  WARNING: API error — {e}", file=sys.stderr)
        return []


def merge_concepts(all_concepts: list[dict]) -> dict[str, dict]:
    """
    Merge concepts with the same slug across essays.
    Combines content paragraphs, deduplicates tags and wikilinks,
    keeps the best summary (longest).
    """
    merged: dict[str, dict] = {}

    for c in all_concepts:
        slug = slugify(c.get("slug", c.get("title", "unknown")))
        if not slug:
            continue

        if slug not in merged:
            merged[slug] = {
                "slug": slug,
                "title": c.get("title", slug.replace("-", " ").title()),
                "summary": c.get("summary", ""),
                "content": c.get("content", ""),
                "tags": list(c.get("tags", [])),
                "wikilinks": list(c.get("wikilinks", [])),
                "source_essays": [c.get("source_essay", "")],
            }
        else:
            existing = merged[slug]
            # Keep longer summary
            if len(c.get("summary", "")) > len(existing["summary"]):
                existing["summary"] = c["summary"]
            # Append additional content
            if c.get("content") and c["content"] not in existing["content"]:
                existing["content"] += "\n\n" + c["content"]
            # Merge tags and wikilinks
            existing["tags"] = list(set(existing["tags"] + list(c.get("tags", []))))
            existing["wikilinks"] = list(set(existing["wikilinks"] + list(c.get("wikilinks", []))))
            essay = c.get("source_essay", "")
            if essay and essay not in existing["source_essays"]:
                existing["source_essays"].append(essay)

    return merged


def write_concepts(sb, concepts: dict[str, dict], mind_slug: str, author: str, dry_run: bool) -> int:
    written = 0
    for slug, c in concepts.items():
        if not c.get("summary") or not c.get("content"):
            continue

        fp = fingerprint(c["content"])

        if not dry_run:
            # Upsert by slug — re-runs are safe
            existing = sb.table("wiki_articles").select("id").eq("slug", slug).execute()
            row = {
                "slug": slug,
                "title": c["title"],
                "summary": c["summary"],
                "content": c["content"],
                "type": "concept",
                "status": "published",
                "tags": c["tags"],
                "topic": mind_slug,
                "wikilinks": c["wikilinks"],
                "content_fingerprint": fp,
                "author": author,
                "mind_slug": mind_slug,
            }
            if existing.data:
                sb.table("wiki_articles").update(row).eq("slug", slug).execute()
            else:
                sb.table("wiki_articles").insert(row).execute()

        written += 1
        if dry_run:
            print(f"  WOULD WRITE  {slug}  (from {len(c['source_essays'])} essay(s))")

    return written


def compile_mind(args):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Supabase env vars not set.")
        sys.exit(1)
    if not ANTHROPIC_KEY:
        print("ERROR: ANTHROPIC_API_KEY not set.")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    AUTHOR_MAP = {
        "paul-graham": "Paul Graham",
        "buffett": "Warren Buffett",
        "munger": "Charlie Munger",
    }
    author = AUTHOR_MAP.get(args.mind, args.mind.replace("-", " ").title())

    print(f"Fetching {args.mind} essays from Supabase…")
    essays = fetch_essays(sb, args.mind, args.limit)
    print(f"  {len(essays)} essays found")

    if not essays:
        print("No essays found. Check mind_slug in raw_sources.metadata.")
        sys.exit(1)

    # Process in batches
    all_concepts: list[dict] = []
    batches = [essays[i:i+BATCH_SIZE] for i in range(0, len(essays), BATCH_SIZE)]
    print(f"\nExtracting concepts ({len(batches)} batches of {BATCH_SIZE})…")

    for i, batch in enumerate(batches):
        batch_slugs = [e.get("metadata", {}).get("slug", f"essay-{i}") for e in batch]
        print(f"  Batch {i+1}/{len(batches)}: {batch_slugs[0]} … {batch_slugs[-1]}", end=" ", flush=True)

        if args.dry_run:
            print("(skipped — dry run)")
            continue

        concepts = extract_concepts_batch(client, batch, author)
        all_concepts.extend(concepts)
        print(f"→ {len(concepts)} concepts extracted")

        # Respect rate limits
        if i < len(batches) - 1:
            time.sleep(0.5)

    if args.dry_run:
        print(f"\nDry run complete. Would process {len(essays)} essays in {len(batches)} batches.")
        return

    print(f"\nTotal raw concepts extracted: {len(all_concepts)}")

    # Merge duplicate concepts
    merged = merge_concepts(all_concepts)
    print(f"After merging: {len(merged)} unique concepts")

    # Write to wiki_articles
    print(f"\nWriting concepts to wiki_articles…")

    if not args.dry_run:
        # Disable RLS for writes — re-enable after
        # (Using anon key so need RLS off)
        pass

    written = write_concepts(sb, merged, args.mind, author, args.dry_run)
    print(f"\nDone. {written} concepts written to wiki_articles.")


def main():
    parser = argparse.ArgumentParser(description="Compile concept pages from raw essays")
    parser.add_argument("--mind", required=True, help="mind_slug (e.g. paul-graham, buffett)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of essays (for testing)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    compile_mind(args)


if __name__ == "__main__":
    main()
