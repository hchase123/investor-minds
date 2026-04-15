import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { WikiArticle, Thought } from "@/lib/supabase";

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

async function getConcepts(): Promise<Pick<WikiArticle, "id" | "slug" | "title" | "summary" | "tags" | "type">[]> {
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, slug, title, summary, tags, type")
    .eq("mind_slug", "buffett")
    .eq("status", "published")
    .order("title");
  return data ?? [];
}

async function getMOCs(): Promise<Pick<WikiArticle, "id" | "slug" | "title" | "summary">[]> {
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, slug, title, summary")
    .eq("mind_slug", "buffett")
    .eq("type", "moc")
    .eq("status", "published")
    .order("title");
  return data ?? [];
}

export default async function BuffettPage() {
  const [letters, concepts, mocs] = await Promise.all([
    getLetters(),
    getConcepts(),
    getMOCs(),
  ]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-4 block text-sm text-stone-400 hover:text-stone-600">
            ← Investor Minds
          </Link>
          <h1 className="text-3xl font-bold text-stone-900">Warren Buffett</h1>
          <p className="mt-2 text-stone-500">
            {letters.length} shareholder letters · 1977–2019 ·{" "}
            {concepts.length > 0 ? `${concepts.length} compiled concepts` : "concepts compiling…"}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Left: Letters timeline */}
          <aside className="lg:col-span-1">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
              Source Letters
            </h2>
            <div className="space-y-1">
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

          {/* Right: Concepts & MOCs */}
          <main className="lg:col-span-2 space-y-10">
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
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Concepts */}
            {concepts.length > 0 ? (
              <section>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
                  Concepts ({concepts.length})
                </h2>
                <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                  {concepts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/buffett/${c.slug}`}
                      className="block px-5 py-4 hover:bg-stone-50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-stone-900">{c.title}</p>
                        {c.tags?.length > 0 && (
                          <span className="ml-3 shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                            {c.tags[0]}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-stone-500 line-clamp-1">
                        {c.summary}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
                <p className="text-stone-500">
                  Concepts are being compiled from the letters.
                </p>
                <p className="mt-1 text-sm text-stone-400">
                  Run <code className="font-mono">/compile</code> pointed at the
                  public Supabase instance to populate this view.
                </p>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
