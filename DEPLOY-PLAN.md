# Plan: Ship Investor Minds to investor-minds.com

## Context

Investor Minds is a public knowledge-graph site for legendary investors. Paul Graham is compiled (667 concepts) but the hub page is a flat list — overwhelming. Buffett letters are ingested (41 in DB) but concepts aren't compiled yet. The site needs MOCs as navigation, search, featured concepts, a Buffett graph page, a PG MOC detail route, and SEO basics before deploying to `investor-minds.com`.

## What exists (verified)

| Asset | Status |
|-------|--------|
| `supabase.ts` query helpers | `getMOCsByMind`, `searchConcepts`, `getConceptsByMind`, `getConceptBySlug`, `getLettersByMind` all exist |
| Buffett hub page | Already fetches + renders MOCs (lines 96-116), has letters timeline + concept list |
| Buffett MOC detail route | `site/app/buffett/moc/[slug]/page.tsx` exists and works |
| Buffett concept detail route | `site/app/buffett/[slug]/page.tsx` exists |
| PG hub page | Flat two-column layout: essays sidebar + concept list. No MOC section. |
| PG graph page | `site/app/paul-graham/graph/page.tsx` works with `KnowledgeGraph.tsx` |
| PG concept detail route | `site/app/paul-graham/[slug]/page.tsx` exists |
| Pipeline scripts | `compile_concepts.py` and `connect_concepts.py` work for any `--mind` |

## What's missing

- Buffett concepts not compiled (0 in `wiki_articles`)
- No MOCs for either mind (0 rows with `type='moc'`)
- No `compile_mocs.py` script
- No `site/app/paul-graham/moc/[slug]/page.tsx` (PG MOC detail route)
- No `site/app/buffett/graph/page.tsx` (Buffett graph route)
- No search component
- No `getFeaturedConcepts()` or `getConceptsByTag()` query helpers
- No SEO (sitemap, robots, OG tags)
- Not deployed

## Dependency graph

```
Phase 1 (Data Pipeline):
  1.1 Compile Buffett concepts → 1.2 Connect Buffett wikilinks
  1.3 Create compile_mocs.py → 1.4 Compile Buffett MOCs
                              → 1.5 Compile PG MOCs
  (1.2 must complete before 1.4)

Phase 2 (Frontend, parallel with Phase 1):
  2.1 Add query helpers → 2.2 Redesign PG hub
                        → 2.3 Enhance Buffett hub
  2.4 Create ConceptSearch → 2.2, 2.3
  2.5 Create PG MOC detail route → 2.2
  2.6 Create Buffett graph page → 2.3

Phase 3 (SEO, after Phase 2):
  3.1 layout.tsx metadata
  3.2 sitemap.ts
  3.3 robots.ts

Phase 4 (Deploy, after all):
  Build → Commit → Vercel → DNS
```

---

## Phase 1: Data Pipeline (run in background)

### 1.1 Compile Buffett concepts
```bash
python3 scripts/compile_concepts.py --mind buffett
```
Uses existing script. ~10-20 min (Haiku, 41 letters).

### 1.2 Connect Buffett wikilinks
```bash
python3 scripts/connect_concepts.py --mind buffett
```
Run after 1.1 completes.

### 1.3 Create `scripts/compile_mocs.py`

New script that:
- Takes `--mind <slug>` argument
- Queries all published concepts for the mind from `wiki_articles` (type='concept')
- Groups by primary tag (`tags[0]`)
- For tags with 8+ concepts, calls Claude Haiku to generate a MOC:
  - Title (e.g., "Paul Graham on Startups")
  - Summary (1-2 sentences)
  - Content: intro paragraph + organized discussion of key themes
  - `wikilinks` array of child concept slugs
- Upserts as `wiki_articles` rows with `type='moc'`, `status='published'`, same `mind_slug`
- Follow the same env-loading pattern as `compile_concepts.py` (reads `site/.env.local`)

### 1.4 Compile Buffett MOCs
```bash
python3 scripts/compile_mocs.py --mind buffett
```

### 1.5 Compile PG MOCs
```bash
python3 scripts/compile_mocs.py --mind paul-graham
```

---

## Phase 2: Frontend (parallel with Phase 1)

### 2.1 Add query helpers to `site/lib/supabase.ts`

Add two new functions:

- `getFeaturedConcepts(mindSlug: string, limit: number)` — query `wiki_articles` where `type='concept'`, `status='published'`, order by `wikilinks` array length descending. Return top N.
- `getConceptsByTag(mindSlug: string)` — fetch all published concepts, group by `tags[0]` client-side, return `Record<string, WikiArticle[]>`.

### 2.2 Redesign PG hub page (`site/app/paul-graham/page.tsx`)

Current: two-column layout with essays sidebar + flat concept list. Redesign to:

**Header** — keep existing back link, title, stats. Add search bar + graph button.

**Featured Concepts** — "Start Here" section. 5-6 concepts with most inbound wikilinks. Card layout with title + summary + tag badge.

**Maps of Content** — grid of MOC cards. Each card: title, summary, concept count. Links to `/paul-graham/moc/[slug]`.

**Browse by Tag** — collapsible tag sections at bottom. Each section: tag name + count header, concept list within. Default collapsed.

### 2.3 Enhance Buffett hub page (`site/app/buffett/page.tsx`)

Add: search bar, featured concepts, graph button, tag-grouped collapsible browse section. Keep letters timeline sidebar.

### 2.4 Create `site/components/ConceptSearch.tsx`

Client component with 300ms debounce, dropdown results, click navigates.

### 2.5 Create `site/app/paul-graham/moc/[slug]/page.tsx`

Copy from Buffett MOC route, adjust mind_slug/links/colors.

### 2.6 Create `site/app/buffett/graph/page.tsx`

Copy from PG graph route, adjust mind_slug/links.

---

## Phase 3: SEO

### 3.1 Edit `site/app/layout.tsx`
Add metadataBase, openGraph, twitter card metadata.

### 3.2 Create `site/app/sitemap.ts`
Dynamic sitemap with all published concepts, MOCs, and static pages.

### 3.3 Create `site/app/robots.ts`
Allow all crawlers, reference `/sitemap.xml`.

---

## Phase 4: Build + Deploy

1. `cd site && npm run build` — verify clean build
2. Commit all changes, push to GitHub
3. `npx vercel --prod` (root directory: `site/`)
4. Set env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Add domain `investor-minds.com` + `www.investor-minds.com` in Vercel
6. Cloudflare DNS: CNAME `@` → `cname.vercel-dns.com` (DNS only, gray cloud)
7. CNAME `www` → `cname.vercel-dns.com` (DNS only)

---

## Files to modify/create

| File | Action | Notes |
|------|--------|-------|
| `scripts/compile_mocs.py` | **Create** | MOC generation script |
| `site/lib/supabase.ts` | **Edit** | Add `getFeaturedConcepts`, `getConceptsByTag` |
| `site/app/paul-graham/page.tsx` | **Rewrite** | MOCs + featured + search + tag groups |
| `site/app/buffett/page.tsx` | **Edit** | Add search, featured, graph button, tag grouping |
| `site/app/paul-graham/moc/[slug]/page.tsx` | **Create** | Copy from Buffett MOC route, adjust mind_slug |
| `site/app/buffett/graph/page.tsx` | **Create** | Copy from PG graph route, adjust mind_slug |
| `site/components/ConceptSearch.tsx` | **Create** | Client-side search component |
| `site/app/layout.tsx` | **Edit** | Add metadataBase, OG, twitter |
| `site/app/sitemap.ts` | **Create** | Dynamic sitemap |
| `site/app/robots.ts` | **Create** | Robots.txt |

## Existing functions to reuse (not recreate)

- `getMOCsByMind(mindSlug)` — `site/lib/supabase.ts:70`
- `searchConcepts(mindSlug, query)` — `site/lib/supabase.ts:94`
- `getConceptsByMind(mindSlug)` — `site/lib/supabase.ts:47`
- `KnowledgeGraph` component — `site/components/KnowledgeGraph.tsx`
- `buildGraphData()` pattern — `site/app/paul-graham/graph/page.tsx:11`

## Verification

1. Run `compile_mocs.py --mind paul-graham --dry-run` — verify tag grouping and MOC count
2. `npm run build` in `site/` — clean build, no type errors
3. `npm run dev` and check:
   - `/` — home page with 4 mind cards
   - `/paul-graham` — search bar, featured concepts, MOC grid, collapsible tag browser
   - `/paul-graham/graph` — D3 graph renders
   - `/paul-graham/moc/[any-moc-slug]` — MOC detail with linked concepts
   - `/buffett` — search, featured, MOC grid, graph button, tag browser
   - `/buffett/graph` — graph renders
   - Search: type a term, results appear, click navigates correctly
   - `/sitemap.xml` — valid XML with all routes
4. After deploy: verify `https://investor-minds.com` serves the site
