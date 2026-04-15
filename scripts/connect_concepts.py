#!/usr/bin/env python3
"""
connect_concepts.py

Second-pass connector: reads all compiled wiki_articles for a mind, then uses
Claude Haiku to identify which concepts are genuinely related and should link
to each other. Rewrites wikilinks based on actual existing slugs.

This fixes the isolation problem where per-essay extraction creates wikilinks
to slugs that don't exist in the graph.

Strategy:
- Chunk concepts into groups of 50
- For each concept, Haiku picks the 3-8 most related slugs from the full list
- Update wikilinks in wiki_articles

Usage:
    python3 scripts/connect_concepts.py --mind paul-graham
    python3 scripts/connect_concepts.py --mind paul-graham --limit 20  # test run
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

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

CONNECT_PROMPT = """\
You are building a knowledge graph. Below is a master list of ALL concept slugs and titles.

Then there is a BATCH of concepts to wire up. For each concept in the batch, return the 4-8 most meaningfully related slugs from the MASTER LIST.

Rules:
- Only use slugs from the MASTER LIST — no invented slugs
- Prefer conceptual relationships over surface-level word matches
- A good link means: "someone reading concept A would genuinely benefit from reading concept B"
- Return 4-8 links per concept (more for rich hub concepts, fewer for narrow ones)
- Do not link a concept to itself

Return a JSON object mapping each concept's slug to an array of related slugs.
Example: {{"default-alive": ["ramen-profitable", "startup-growth", "fundraising-timing"], ...}}

No markdown, no explanation — just the JSON object.

MASTER LIST (slug → title):
{master_list}

BATCH TO WIRE:
{batch}"""


def fetch_concepts(sb, mind_slug: str, limit: int | None) -> list[dict]:
    q = (
        sb.table("wiki_articles")
        .select("id, slug, title, summary, tags")
        .eq("mind_slug", mind_slug)
        .eq("status", "published")
        .order("slug")
    )
    if limit:
        q = q.limit(limit)
    resp = q.execute()
    return resp.data or []


def connect_batch(
    client: anthropic.Anthropic,
    batch: list[dict],
    master_list: list[dict],
) -> dict[str, list[str]]:
    master_str = "\n".join(f"- {c['slug']}: {c['title']}" for c in master_list)
    batch_str = "\n".join(
        f"- {c['slug']}: {c['title']} | {c.get('summary', '')} | tags: {', '.join(c.get('tags') or [])}"
        for c in batch
    )

    prompt = CONNECT_PROMPT.format(master_list=master_str, batch=batch_str)

    try:
        msg = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        return result if isinstance(result, dict) else {}
    except Exception as e:
        print(f"  WARNING: {e}", file=sys.stderr)
        return {}


def connect(args):
    if not SUPABASE_URL or not SUPABASE_KEY or not ANTHROPIC_KEY:
        print("ERROR: env vars not set.")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    print(f"Fetching {args.mind} concepts…")
    all_concepts = fetch_concepts(sb, args.mind, limit=None)
    print(f"  {len(all_concepts)} concepts loaded")

    # Build slug → id map and valid slug set for validation
    slug_to_id: dict[str, str] = {c["slug"]: c["id"] for c in all_concepts}
    valid_slugs = set(slug_to_id.keys())

    # Work set — may be limited for testing
    work_concepts = all_concepts[:args.limit] if args.limit else all_concepts

    BATCH_SIZE = 25  # concepts per LLM call (master list is sent every time)
    batches = [work_concepts[i:i+BATCH_SIZE] for i in range(0, len(work_concepts), BATCH_SIZE)]
    print(f"\nConnecting {len(work_concepts)} concepts in {len(batches)} batches…")

    total_links = 0
    updated = 0

    for i, batch in enumerate(batches):
        print(f"  Batch {i+1}/{len(batches)}: {batch[0]['slug']} … {batch[-1]['slug']}", end=" ", flush=True)

        links_map = connect_batch(client, batch, all_concepts)

        if not links_map:
            print("→ skipped")
            continue

        batch_links = 0
        for concept in batch:
            slug = concept["slug"]
            raw_links = links_map.get(slug, [])
            # Validate — only keep slugs that actually exist
            valid_links = [s for s in raw_links if s in valid_slugs and s != slug]

            if not valid_links:
                continue

            if not args.dry_run:
                sb.table("wiki_articles").update(
                    {"wikilinks": valid_links}
                ).eq("id", slug_to_id[slug]).execute()

            batch_links += len(valid_links)
            updated += 1

        total_links += batch_links
        print(f"→ {batch_links} links written across {len(batch)} concepts")

        if i < len(batches) - 1:
            time.sleep(0.3)

    print(f"\nDone. {updated} concepts updated, {total_links} total links written.")
    if args.dry_run:
        print("(DRY RUN — no DB writes)")


def main():
    parser = argparse.ArgumentParser(description="Connect concepts with validated wikilinks")
    parser.add_argument("--mind", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    connect(args)


if __name__ == "__main__":
    main()
