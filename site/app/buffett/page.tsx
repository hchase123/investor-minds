import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getMOCsByMind, getFeaturedConcepts, getConceptsByTag } from "@/lib/supabase";
import type { Thought } from "@/lib/supabase";
import ConceptSearch from "@/components/ConceptSearch";
import TagBrowser from "@/components/TagBrowser";

export const metadata = {
  title: "Warren Buffett — Investor Minds",
  description:
    "Knowledge graph of Warren Buffett's ideas from 41 Berkshire Hathaway shareholder letters (1977–2019).",
};

async function getLetters(): Promise<Pick<Thought, "id" | "year" | "metadata" | "content">[]> {
  const { data } = await supabase
    .from("thoughts")
    .select("id, year, metadata, content")
    .eq("mind_slug", "buffett")
    .order("year");
  return data ?? [];
}

async function getConceptCount(): Promise<number> {
  const { count } = await supabase
    .from("wiki_articles")
    .select("id", { count: "exact", head: true })
    .eq("mind_slug", "buffett")
    .eq("type", "concept")
    .eq("status", "published");
  return count ?? 0;
}

export default async function BuffettPage() {
  const [letters, conceptCount, mocs, featured, tagGroups] = await Promise.all([
    getLetters(),
    getConceptCount(),
    getMOCsByMind("buffett"),
    getFeaturedConcepts("buffett", 6),
    getConceptsByTag("buffett"),
  ]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-4 block text-sm text-stone-400 hover:text-stone-600">
            ← Investor Minds
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-stone-900">Warren Buffett</h1>
              <p className="mt-2 text-stone-500">
                {letters.length} shareholder letters · 1977–2019 ·{" "}
                {conceptCount > 0 ? `${conceptCount} compiled concepts` : "concepts compiling…"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ConceptSearch mindSlug="buffett" />
              <Link
                href="/buffett/graph"
                className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 transition"
              >
                View Graph →
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Left: Letters timeline */}
          <aside className="lg:col-span-1">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
              Source Letters
            </h2>
            <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
              {letters.map((t) => {
                const meta = t.metadata as Record<string, string>;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-stone-100"
                  >
                    <span className="font-mono text-sm text-stone-700">
                      {t.year}
                    </span>
                    <span className="text-xs text-stone-400">
                      {meta?.word_count
                        ? `${Number(meta.word_count).toLocaleString()} words`
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Right: Featured + MOCs + Tag Browser */}
          <main className="lg:col-span-2 space-y-10">
            {/* Featured Concepts */}
            {featured.length > 0 && (
              <section>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
                  Start Here
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {featured.map((c) => (
                    <Link
                      key={c.id}
                      href={`/buffett/${c.slug}`}
                      className="rounded-xl border border-stone-200 bg-white p-4 hover:shadow-sm transition"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-stone-900">{c.title}</p>
                        {c.tags?.length > 0 && (
                          <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                            {c.tags[0]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-stone-500 line-clamp-2">
                        {c.summary}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* MOCs */}
            {mocs.length > 0 && (
              <section>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
                  Maps of Content
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {mocs.map((moc) => (
                    <Link
                      key={moc.id}
                      href={`/buffett/moc/${moc.slug}`}
                      className="rounded-xl border border-stone-200 bg-white p-4 hover:shadow-sm transition"
                    >
                      <p className="font-medium text-stone-900">{moc.title}</p>
                      <p className="mt-1 text-xs text-stone-400 line-clamp-2">
                        {moc.summary}
                      </p>
                      {moc.wikilinks?.length > 0 && (
                        <p className="mt-2 text-xs text-stone-300">
                          {moc.wikilinks.length} concepts
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Browse by Tag */}
            {Object.keys(tagGroups).length > 0 && (
              <section>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
                  Browse by Tag
                </h2>
                <TagBrowser tagGroups={tagGroups} mindSlug="buffett" />
              </section>
            )}

            {/* Empty state */}
            {conceptCount === 0 && (
              <section className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
                <p className="text-stone-500">
                  Concepts are being compiled from the letters.
                </p>
                <p className="mt-1 text-sm text-stone-400">
                  Run <code className="font-mono">compile_concepts.py --mind buffett</code> to populate this view.
                </p>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
