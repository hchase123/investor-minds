---
title: Investor Minds — Implementation Plan
created: 2026-04-14
status: ready-to-build
owner: Harrison
---

# Investor Minds — Implementation Plan

A series of public, author-filtered knowledge graph websites — one per legendary investor — built on the same compile-to-concepts pipeline as the personal Second Brain wiki (`~/Developer/wiki`).

Each site is a different *view* over a shared concept-extraction infrastructure. Buffett ships first; Munger, Damodaran, Bogle, Lynch follow without new infra.

---

## Architecture decision (locked)

**Two Supabase projects, one-way publish, personal reads public.**

```
Personal Second Brain (private)        Investor Minds (public)
   thoughts                                wiki_articles
   wiki_articles  ───── publish ────►      raw_sources
   raw_sources                             public read API
       ▲                                       │
       │                                       │
       └──── read public concepts ─────────────┘
```

**Why:**
- Personal thoughts never live in a public-facing database. Hard isolation, not RLS-dependent.
- Public Investor Minds DB only contains public-domain or fair-use content (Buffett letters, Munger speeches, Damodaran lectures).
- One-way publish: personal pipeline can write to public; public has no write-back path.
- Personal instance gets read-only API access to public so the seeker agent can cross-link `[[buffett:moats]]` from personal notes.
- Blast radius is bounded: a public-site compromise leaves personal data untouched.

**Rejected alternatives:**
- Single Supabase + RLS: one config mistake exposes personal data. Not worth the cross-linking convenience.
- Personal-as-source-of-truth + generated public mirror: easy to accidentally mark something public.

---

## Phase 0 — Foundations (1-2 hours)

- [x] Create new Supabase project `investor-minds-public` — project ID: `ywlvnlubxusqhtdevbsp`
- [x] Mirror schema from personal Second Brain: `thoughts`, `wiki_articles`, `raw_sources` tables
- [x] Add `author` column (text) and `mind_slug` column (text, e.g. `buffett`, `munger`) to `wiki_articles` and `thoughts`
- [x] Generate publishable API key — stored in `.env.local` (gitignored), template in `.env.example`
- [ ] Store API key in personal wiki's `.env.local` so seeker agent can query public concepts (`INVESTOR_MINDS_SUPABASE_URL` + `INVESTOR_MINDS_SUPABASE_ANON_KEY`)
- [ ] Decide and register domain — recommendation: single umbrella `investorminds.io` (or similar) with `/buffett`, `/munger`, etc. paths. One domain = one DNS, one cert, one deploy

## Phase 1 — Buffett vertical slice (4-8 hours)

**Goal: end-to-end one mind shipped before generalizing.**

- [ ] Acquire BH Letters PDF: already at `~/Library/CloudStorage/Dropbox/2.LIFE/40-49 Resources/43 Business Knowledge/Finance/BH letters.pdf` (8.6 MB, ~50 letters bundled)
- [ ] Split PDF by year — write a small Python/Node script to detect year boundaries (each letter starts with "BERKSHIRE HATHAWAY INC. ... Chairman's Letter")
- [ ] Extract each letter's text into `raw_sources` (heavy text storage)
- [ ] Insert one `thoughts` row per letter: `source_type='book'`, `author='Warren Buffett'`, `year=YYYY`, `mind_slug='buffett'`, FK to `raw_sources`
- [ ] Compile concepts using the existing wiki agent chain (architect → connector → librarian) **but pointed at the public Supabase instance**. May require a `--target=public` flag on `/compile` or a forked compile command
- [ ] Hand-curate Buffett MOC pages: one per decade (`buffett-1965-1979`, `buffett-1980s`, etc.) and one per theme (`buffett-on-moats`, `buffett-on-capital-allocation`, `buffett-on-inflation`)
- [ ] Build a minimal Next.js or Astro frontend in this folder (`~/Developer/investor-minds/site/`) that queries the public Supabase
  - Concept page route: `/buffett/[slug]`
  - MOC page route: `/buffett/moc/[slug]`
  - Graph view: use `react-force-graph` or `cytoscape.js` over the wikilink edges
  - Search: Supabase pgvector embedding search across Buffett-only rows
- [ ] Ship to Vercel/Cloudflare Pages
- [ ] Test the personal-reads-public link: have personal seeker agent answer "what does Buffett say about intrinsic value?" by querying public concepts and citing them

## Phase 2 — Cross-linking the personal instance (2-3 hours)

- [ ] Add a `public_mind_link` extension to the personal seeker agent
- [ ] When compiling personal notes, run the connector agent against the public Supabase to find Buffett/Munger/etc. concepts that should be cited
- [ ] Personal `wiki_articles` get a `cross_links` column or a join table referencing public concept slugs
- [ ] Render personal wiki UI (Obsidian) with `[[buffett:moats]]`-style links that resolve via the public read API

## Phase 3 — Generalize to second mind (2-4 hours)

Pick one: **Munger** (Poor Charlie's Almanack + USC speech) is the most natural fit because his thinking interleaves with Buffett's.

- [ ] Source Munger material (Almanack PDF, USC commencement transcript, Daily Journal annual meeting transcripts)
- [ ] Insert with `mind_slug='munger'`, `author='Charlie Munger'`
- [ ] Compile through the same pipeline
- [ ] Frontend route `/munger/[slug]` should work with zero new code if Phase 1 was built right
- [ ] Cross-mind links: when Buffett mentions Munger's mental models, the connector should link to Munger concepts and vice versa
- [ ] If Phase 3 takes more than 4 hours, the abstraction in Phase 1 was wrong — refactor before adding mind #3

## Phase 4 — Scale to remaining minds (ongoing)

Each of these is one ingest + one compile run + one MOC curation pass:

- [ ] **Aswath Damodaran** — NYU Stern lecture notes + valuation books. Heaviest academic content. Probably best as a dedicated pass.
- [ ] **John Bogle** — *Common Sense on Mutual Funds*, *The Little Book of Common Sense Investing*, Bogleheads forum highlights
- [ ] **Peter Lynch** — *One Up on Wall Street*, *Beating the Street*
- [ ] **Howard Marks** — Oaktree memos (publicly archived, decades of them)
- [ ] **Seth Klarman** — *Margin of Safety* (out-of-print, fair use considerations)
- [ ] **Joel Greenblatt** — *You Can Be a Stock Market Genius*, Magic Formula

## Phase 5 — Public polish (variable)

- [ ] OG image generation for each concept page (Vercel OG)
- [ ] RSS feed per mind (`/buffett/feed.xml`) so people can subscribe
- [ ] Newsletter that pushes new compiled concepts weekly
- [ ] Embedding search UI (Algolia-style instant search)
- [ ] Mobile-optimized graph view

---

## Open questions to answer before Phase 1

1. **Domain**: register `investorminds.io`? Check availability and cost. Alternatives: `investormind.dev`, `mindof.investing`, `valuegraph.io`
2. **Fair use**: BH Letters are publicly published by Berkshire on their site — clearly fair use to summarize and link. Confirm same for Munger, Damodaran, Bogle, Lynch material before ingesting copyrighted books. Out-of-print Klarman is grayer.
3. **License**: what license does the public site itself release concepts under? CC-BY 4.0 with attribution back to original sources is the obvious answer.
4. **Compile target flag**: does the personal `/compile` command get a `--target=public` flag, or do we fork a separate `/publish-to-investor-minds` command? Decide before Phase 1.
5. **Auth**: does the public site need any auth, or is everything truly public? Recommendation: fully public read, no auth, no accounts. Reduces scope.

---

## Risks

- **Compile pipeline coupling**: the existing `/compile` command is tightly coupled to the personal Supabase project ID. Decoupling may require more refactoring than expected. Budget extra time for Phase 1.
- **Embedding cost**: ~50 Buffett letters × ~20 concepts each = ~1000 embeddings just for Buffett. Multiplied across all minds, could be ~10k embeddings. OpenAI text-embedding-3-small at $0.02/1M tokens is negligible, but worth budgeting.
- **MOC curation is the slow step**: agents extract concepts, but the human-curated MOC layer is what makes the site readable. Plan on real time for this per mind, not just compile time.
- **Scope creep**: it's tempting to add features (newsletters, podcasts, courses) before shipping the basic graph. Resist. Phase 1 is just: read concepts, click links, see graph.

---

## Success criteria for Phase 1

The Buffett site is shipped when:
- A non-technical visitor can land on `investorminds.io/buffett`, click "Moats," read a 1-paragraph definition with citations from 5+ different Buffett letters, and follow `[[pricing-power]]` to the next concept
- Harrison's personal Obsidian shows `[[buffett:moats]]` links that resolve to the public site
- New BH letters can be added with one command (drop the new letter PDF in `wiki/raw/`, run publish)

---

## Where to pick up

This plan is ready for a fresh Claude Code session. Open this folder (`~/Developer/investor-minds/`) and start with **Phase 0** unless one of the open questions needs answering first.

Personal Second Brain reference:
- `~/Developer/wiki/CLAUDE.md` — schema, conventions, agent routing
- `~/Developer/wiki/_memory.md` — Harrison's profile
- Personal Supabase project ID: `lwioiytstoeoicnjvmkb`
- Latest personal checkpoint: `~/.claude/projects/-Users-hchase-Developer/memory/project_second_brain_20260414.md`
