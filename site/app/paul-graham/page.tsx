import Link from "next/link";
import { getMOCsByMind, getFeaturedConcepts, getConceptsByTag } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import ConceptSearch from "@/components/ConceptSearch";
import TagBrowser from "@/components/TagBrowser";

export const metadata = {
  title: "Paul Graham — Investor Minds",
  description:
    "Knowledge graph of Paul Graham's essays on startups, programming, and ideas.",
};

async function getEssayCount(): Promise<number> {
  const { count } = await supabase
    .from("thoughts")
    .select("id", { count: "exact", head: true })
    .eq("mind_slug", "paul-graham");
  return count ?? 0;
}

async function getConceptCount(): Promise<number> {
  const { count } = await supabase
    .from("wiki_articles")
    .select("id", { count: "exact", head: true })
    .eq("mind_slug", "paul-graham")
    .eq("type", "concept")
    .eq("status", "published");
  return count ?? 0;
}

export default async function PaulGrahamPage() {
  const [essayCount, conceptCount, mocs, featured, tagGroups] = await Promise.all([
    getEssayCount(),
    getConceptCount(),
    getMOCsByMind("paul-graham"),
    getFeaturedConcepts("paul-graham", 6),
    getConceptsByTag("paul-graham"),
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
              <h1 className="text-3xl font-bold text-stone-900">Paul Graham</h1>
              <p className="mt-2 text-stone-500">
                {essayCount} essays · {conceptCount} compiled concepts
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ConceptSearch mindSlug="paul-graham" />
              <Link
                href="/paul-graham/graph"
                className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 transition"
              >
                View Graph →
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-12">
        {/* Featured Concepts */}
        {featured.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
              Start Here
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((c) => (
                <Link
                  key={c.id}
                  href={`/paul-graham/${c.slug}`}
                  className="rounded-xl border border-stone-200 bg-white p-4 hover:shadow-sm transition"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-stone-900">{c.title}</p>
                    {c.tags?.length > 0 && (
                      <span className="ml-2 shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
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

        {/* Maps of Content */}
        {mocs.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
              Maps of Content
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mocs.map((moc) => (
                <Link
                  key={moc.id}
                  href={`/paul-graham/moc/${moc.slug}`}
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
            <TagBrowser tagGroups={tagGroups} mindSlug="paul-graham" />
          </section>
        )}
      </div>
    </div>
  );
}
