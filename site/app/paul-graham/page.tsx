import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { WikiArticle, Thought } from "@/lib/supabase";

export const metadata = {
  title: "Paul Graham — Investor Minds",
  description:
    "Knowledge graph of Paul Graham's essays on startups, programming, and ideas.",
};

async function getEssays(): Promise<Pick<Thought, "id" | "year" | "metadata" | "content">[]> {
  const { data } = await supabase
    .from("thoughts")
    .select("id, year, metadata, content")
    .eq("mind_slug", "paul-graham")
    .order("created_at");
  return data ?? [];
}

async function getConcepts(): Promise<Pick<WikiArticle, "id" | "slug" | "title" | "summary" | "tags" | "type">[]> {
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, slug, title, summary, tags, type")
    .eq("mind_slug", "paul-graham")
    .eq("status", "published")
    .order("title");
  return data ?? [];
}

export default async function PaulGrahamPage() {
  const [essays, concepts] = await Promise.all([getEssays(), getConcepts()]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-4 block text-sm text-stone-400 hover:text-stone-600">
            ← Investor Minds
          </Link>
          <h1 className="text-3xl font-bold text-stone-900">Paul Graham</h1>
          <p className="mt-2 text-stone-500">
            {essays.length} essays ·{" "}
            {concepts.length > 0
              ? `${concepts.length} compiled concepts`
              : "concepts compiling…"}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Essays list */}
          <aside className="lg:col-span-1">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
              Source Essays ({essays.length})
            </h2>
            <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
              {essays.map((t) => {
                const meta = t.metadata as Record<string, string>;
                return (
                  <div
                    key={t.id}
                    className="rounded-lg px-3 py-2 hover:bg-stone-100"
                  >
                    <p className="text-sm text-stone-700 leading-snug">
                      {meta?.title ?? t.content.slice(0, 50)}
                    </p>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Concepts */}
          <main className="lg:col-span-2">
            {concepts.length > 0 ? (
              <section>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
                  Concepts ({concepts.length})
                </h2>
                <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                  {concepts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/paul-graham/${c.slug}`}
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
                  {essays.length} essays ingested.
                </p>
                <p className="mt-1 text-sm text-stone-400">
                  Run the compile pipeline to extract concepts from the essays.
                </p>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
