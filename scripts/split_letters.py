#!/usr/bin/env python3
"""
split_letters.py

Splits the bundled BH Letters PDF into per-year text files saved to
data/letters/YYYY.txt. Each file contains the clean extracted text for
that year's shareholder letter.

Also extracts Munger's 2014 Vice Chairman letter to data/letters/munger-2014.txt.

Usage:
    python3 scripts/split_letters.py

Output:
    data/letters/YYYY.txt          (one per Buffett letter year)
    data/letters/munger-2014.txt   (Munger Vice Chairman letter)
    data/letters/manifest.json     (year → page range, word count, char count)
"""

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

PDF_PATH = Path(
    "/Users/hchase/Library/CloudStorage/Dropbox/2.LIFE/40-49 Resources"
    "/43 Business Knowledge/Finance/BH letters.pdf"
)
OUT_DIR = Path(__file__).parent.parent / "data" / "letters"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Pattern: "To the Shareholders of Berkshire Hathaway"
SHAREHOLDERS_PAT = re.compile(r"to the shareholders of berkshire hathaway", re.I)
# Munger's Vice Chairman letter
VICE_CHAIR_PAT = re.compile(r"vice chairman.{0,5}s?\s+thoughts", re.I)
# Noise pages: performance tables that appear before each letter post-1999
NOTE_PAT = re.compile(r"note.*following table.*facing page.*chairman", re.I)
# Year in "filing year" header page (early letters only)
SINGLE_YEAR_PAT = re.compile(r"^\s*(19[6-9]\d|20[0-2]\d)\s*$")
# Year mentioned explicitly in content
CONTENT_YEAR_PAT = re.compile(r"(?:during|earned.*in|for|in)\s+(19[6-9]\d|20[0-2]\d)", re.I)


def get_prev_page_year(doc: fitz.Document, page_idx: int) -> int | None:
    """
    For early letters the page before the letter is a bare year string (the
    filing year). The letter year is filing_year − 1.
    """
    if page_idx == 0:
        return None
    prev_text = doc[page_idx - 1].get_text().strip()
    m = SINGLE_YEAR_PAT.match(prev_text[:20])
    if m:
        return int(m.group(1)) - 1
    return None


def get_content_year(text: str) -> int | None:
    """Extract the year being reported from letter content."""
    m = CONTENT_YEAR_PAT.search(text[:800])
    if m:
        return int(m.group(1))
    years = [int(y) for y in re.findall(r'\b(19[6-9]\d|20[0-2]\d)\b', text[:1200])
             if 1965 <= int(y) <= 2022]
    if years:
        from collections import Counter
        return Counter(years).most_common(1)[0][0]
    return None


def find_boundaries(doc: fitz.Document) -> list[tuple[int, str, str]]:
    """
    Returns list of (page_index, letter_type, raw_first_page_text).
    letter_type is 'buffett' or 'munger'.
    Skips performance-table noise pages.
    """
    boundaries = []
    for i, page in enumerate(doc):
        text = page.get_text()
        if NOTE_PAT.search(text[:500]):
            continue
        if VICE_CHAIR_PAT.search(text[:300]):
            boundaries.append((i, "munger", text))
        elif SHAREHOLDERS_PAT.search(text[:800]):
            boundaries.append((i, "buffett", text))
    return boundaries


def split_and_save(doc: fitz.Document, boundaries: list[tuple[int, str, str]]) -> dict:
    manifest = {}
    total = len(doc)

    for idx, (start_page, letter_type, first_text) in enumerate(boundaries):
        end_page = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else total

        # Collect all text for this letter
        pages_text = [first_text]
        for p in range(start_page + 1, end_page):
            pages_text.append(doc[p].get_text())
        full_text = "\n\n".join(pages_text)

        # Munger letter
        if letter_type == "munger":
            slug = "munger-2014"
            out_path = OUT_DIR / f"{slug}.txt"
            out_path.write_text(full_text, encoding="utf-8")
            manifest[slug] = {
                "slug": slug,
                "author": "Charlie Munger",
                "mind_slug": "munger",
                "year": 2014,
                "start_page": start_page,
                "end_page": end_page - 1,
                "page_count": end_page - start_page,
                "char_count": len(full_text),
                "word_count": len(full_text.split()),
                "file": f"data/letters/{slug}.txt",
            }
            print(f"  munger-2014: pages {start_page}–{end_page-1}  ({len(full_text.split()):,} words)  → {slug}.txt")
            continue

        # Determine Buffett letter year
        year = get_prev_page_year(doc, start_page)
        if year is None:
            year = get_content_year(full_text)
        if year is None:
            print(f"  WARNING: could not detect year for letter starting p{start_page}, skipping",
                  file=sys.stderr)
            continue

        out_path = OUT_DIR / f"{year}.txt"
        # Don't overwrite if already written (duplicate detection)
        if out_path.exists():
            print(f"  DUPLICATE year={year} at p{start_page} — keeping earlier extraction")
            continue

        out_path.write_text(full_text, encoding="utf-8")
        manifest[str(year)] = {
            "year": year,
            "author": "Warren Buffett",
            "mind_slug": "buffett",
            "start_page": start_page,
            "end_page": end_page - 1,
            "page_count": end_page - start_page,
            "char_count": len(full_text),
            "word_count": len(full_text.split()),
            "file": f"data/letters/{year}.txt",
        }
        print(f"  {year}: pages {start_page}–{end_page-1}  ({len(full_text.split()):,} words)  → {year}.txt")

    return manifest


def main():
    print(f"Opening {PDF_PATH.name} ({PDF_PATH.stat().st_size / 1e6:.1f} MB)…")
    doc = fitz.open(str(PDF_PATH))
    print(f"  {len(doc)} pages total")

    # Clean previous output
    for f in OUT_DIR.glob("*.txt"):
        f.unlink()

    print("\nFinding letter boundaries…")
    boundaries = find_boundaries(doc)
    print(f"  Found {len(boundaries)} letter starts")

    print("\nExtracting letters…")
    manifest = split_and_save(doc, boundaries)

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8"
    )

    buffett_count = sum(1 for v in manifest.values() if v.get("mind_slug") == "buffett")
    munger_count = sum(1 for v in manifest.values() if v.get("mind_slug") == "munger")
    print(f"\nDone. {buffett_count} Buffett letters + {munger_count} Munger letter(s) → {OUT_DIR}")
    print(f"Manifest: {manifest_path}")

    import json as _json
    years = sorted(k for k in manifest if k.isdigit())
    print(f"Years covered: {years[0]}–{years[-1]}")
    missing = [str(y) for y in range(int(years[0]), int(years[-1]) + 1)
               if str(y) not in manifest]
    if missing:
        print(f"Years NOT in PDF: {missing}")


if __name__ == "__main__":
    main()
