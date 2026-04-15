---
title: Investor Minds
created: 2026-04-14
status: idea
---

# Investor Minds

## The seed idea

> Bonus: once the Buffett view exists, the same pattern unlocks Munger, Damodaran, Bogle, Lynch as additional author-filtered sites — a whole "investor minds" series — without spinning up new infra each time.

## What this is

A series of public, author-filtered knowledge graph websites — one per legendary investor — built on the same compile-to-concepts pipeline as the personal Second Brain wiki. Each site is a different *view* over a shared concept extraction infrastructure.

## Candidate minds

- Warren Buffett (BH shareholder letters 1965→present)
- Charlie Munger (Poor Charlie's Almanack, USC speech, lattice of mental models)
- Aswath Damodaran (NYU Stern lecture notes, valuation books, blog)
- John Bogle (index investing canon)
- Peter Lynch (One Up on Wall Street, Beating the Street)
- Howard Marks (Oaktree memos)
- Seth Klarman (Margin of Safety)
- Joel Greenblatt (You Can Be a Stock Market Genius, Magic Formula)

## Open questions

- **Security/isolation**: should public investor-minds data live in the same Supabase as personal thoughts, or a separate instance with one-way sync? (TBD — see decision needed below.)
- **Domain strategy**: one umbrella domain (`investorminds.io/buffett`) or one domain per mind?
- **Cross-linking**: how do the sites discover each other's concepts? Shared taxonomy of investing concepts that all minds reference?
- **Updates**: how often do new letters/memos get pulled? Manual queue or scheduled?

## Decision needed

Whether to host the public investor data in:
1. **Same Supabase project** as personal Second Brain — easy cross-linking, but mixes public and private rows. Requires strict RLS policies.
2. **Separate Supabase project** — clean isolation, but cross-linking to personal investing notes requires a sync or federation layer.
3. **Hybrid**: separate public DB for the sites, but personal instance gets read access to query the public concepts when compiling personal notes.

Leaning toward (3) — publish-to-public is one-way, personal can read public, public never sees personal.
