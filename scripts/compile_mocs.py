#!/usr/bin/env python3
"""
compile_mocs.py

Generates Maps of Content (MOCs) from compiled concepts. Groups concepts by
primary tag, then uses Claude Haiku to write a curated overview page for each
tag with 5+ concepts.

Usage:
    python3 scripts/compile_mocs.py --mind paul-graham
    python3 scripts/compile_mocs.py --mind buffett --dry-run

Environment (from site/.env.local):
    ANTHROPIC_API_KEY
    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
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

AUTHOR_MAP: dict[str, str] = {
    "paul-graham": "Paul Graham",
    "buffett": "Warren Buffett",
    "munger": "Charlie Munger",
}

MOC_PROMPT = """\
You are building a public knowledge graph of {author}'s ideas.

Below is a list of concepts tagged with "{tag}". Write a Map of Content page that:
1. Opens with a 1-2 sentence summary of what {author} thinks about {tag}
2. Has a 2-3 paragraph overview that weaves together the key themes
3. Uses [[Concept Title]] wikilink syntax when referencing concepts from the list
4. Organizes the discussion so readers understand how the concepts relate

Return a JSON object with these fields:
- "title": "{author} on {tag_title}" (Title Case the tag)
- "summary": 1-2 sentence overview (≤30 words)
- "content": the full MOC text (2-3 paragraphs with [[wikilinks]])

No markdown, no explanation — just the JSON object.

Concepts:
{concepts}"""


def fetch_concepts(sb, mind_slug: str) -> list[dict]:
    """Fetch all published concepts for a mind."""
    resp = (
        sb.table("wiki_articles")
        .select("id, slug, title, summary, tags")
        .eq("mind_slug", mind_slug)
        .eq("type", "concept")
        .eq("status", "published")
        .order("title")
        .execute()
    )
    return resp.data or []


def group_by_tag(concepts: list[dict], min_size: int = 5) -> dict[str, list[dict]]:
    """Group concepts by primary tag, keeping only groups with min_size+ members."""
    groups: dict[str, list[dict]] = {}
    for c in concepts:
        tags = c.get("tags") or []
        if not tags:
            continue
        tag = tags[0].lower()
        groups.setdefault(tag, []).append(c)

    return {tag: members for tag, members in sorted(groups.items()) if len(members) >= min_size}


def generate_moc(
    client: anthropic.Anthropic,
    tag: str,
    concepts: list[dict],
    author: str,
) -> dict | None:
    """Call Haiku to generate a MOC for a tag group."""
    concepts_text = "\n".join(
        f"- {c['slug']}: {c['title']} — {c.get('summary', '')}"
        for c in concepts
    )
    tag_title = tag.replace("-", " ").title()

    prompt = MOC_PROMPT.format(
        author=author,
        tag=tag,
        tag_title=tag_title,
        concepts=concepts_text,
    )

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
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError as e:
        print(f"  WARNING: JSON parse error for tag '{tag}' — {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  WARNING: API error for tag '{tag}' — {e}", file=sys.stderr)
        return None


def upsert_moc(
    sb,
    moc_data: dict,
    tag: str,
    concept_slugs: list[str],
    mind_slug: str,
    author: str,
    dry_run: bool,
) -> bool:
    """Upsert a MOC row into wiki_articles."""
    slug = f"{tag}-moc"

    if dry_run:
        print(f"  WOULD WRITE  {slug}  ({len(concept_slugs)} concepts)")
        return True

    row = {
        "slug": slug,
        "title": moc_data.get("title", f"{author} on {tag.title()}"),
        "summary": moc_data.get("summary", ""),
        "content": moc_data.get("content", ""),
        "type": "moc",
        "status": "published",
        "tags": [tag],
        "topic": mind_slug,
        "wikilinks": concept_slugs,
        "author": author,
        "mind_slug": mind_slug,
    }

    existing = sb.table("wiki_articles").select("id").eq("slug", slug).execute()
    if existing.data:
        sb.table("wiki_articles").update(row).eq("slug", slug).execute()
    else:
        sb.table("wiki_articles").insert(row).execute()

    return True


def compile_mocs(args: argparse.Namespace) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Supabase env vars not set.")
        sys.exit(1)
    if not ANTHROPIC_KEY:
        print("ERROR: ANTHROPIC_API_KEY not set.")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    author = AUTHOR_MAP.get(args.mind, args.mind.replace("-", " ").title())

    print(f"Fetching {args.mind} concepts…")
    concepts = fetch_concepts(sb, args.mind)
    print(f"  {len(concepts)} published concepts found")

    if not concepts:
        print("No concepts found. Run compile_concepts.py first.")
        sys.exit(1)

    groups = group_by_tag(concepts, min_size=5)
    print(f"  {len(groups)} tags with 5+ concepts")

    if not groups:
        print("No tags have enough concepts for a MOC.")
        return

    for tag in groups:
        print(f"    {tag}: {len(groups[tag])} concepts")

    print(f"\nGenerating MOCs…")
    written = 0

    for i, (tag, members) in enumerate(groups.items()):
        print(f"  [{i+1}/{len(groups)}] {tag} ({len(members)} concepts)", end=" ", flush=True)

        if args.dry_run:
            upsert_moc(sb, {}, tag, [c["slug"] for c in members], args.mind, author, dry_run=True)
            written += 1
            continue

        moc_data = generate_moc(client, tag, members, author)
        if not moc_data:
            print("→ skipped (generation failed)")
            continue

        concept_slugs = [c["slug"] for c in members]
        upsert_moc(sb, moc_data, tag, concept_slugs, args.mind, author, dry_run=False)
        written += 1
        print(f"→ written")

        if i < len(groups) - 1:
            time.sleep(0.5)

    print(f"\nDone. {written} MOCs {'would be ' if args.dry_run else ''}written.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile Maps of Content from concepts")
    parser.add_argument("--mind", required=True, help="mind_slug (e.g. paul-graham, buffett)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    compile_mocs(args)


if __name__ == "__main__":
    main()
