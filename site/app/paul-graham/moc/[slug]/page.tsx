import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { WikiArticle } from "@/lib/supabase";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getMOC(slug: string): Promise<WikiArticle | null> {
  const { data } = await supabase
    .from("wiki_articles")
    .select("*")
    .eq("slug", slug)
    .eq("mind_slug", "paul-graham")
    .eq("type", "moc")
    .single();
  return data ?? null;
}

async function getLinkedConcepts(slugs: string[]): Promise<Pick<WikiArticle, "id" | "slug" | "title" | "summary" | "tags">[]> {
  if (slugs.length === 0) return [];
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, slug, title, summary, tags")
    .eq("mind_slug", "paul-graham")
    .in("slug", slugs);
  return data ?? [];
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const moc = await getMOC(slug);
  if (!moc) return { title: "Not Found" };
  return {
    title: `${moc.title} — Paul Graham · Investor Minds`,
    description: moc.summary,
  };
}

export default async function MOCPage({ params }: Props) {
  const { slug } = await params;
  const moc = await getMOC(slug);
  if (!moc) notFound();

  const concepts = await getLinkedConcepts(moc.wikilinks ?? []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <nav className="mb-4 flex gap-2 text-sm text-stone-400">
            <Link href="/" className="hover:text-stone-600">Investor Minds</Link>
            <span>/</span>
            <Link href="/paul-graham" className="hover:text-stone-600">Paul Graham</Link>
            <span>/</span>
            <span className="text-stone-600">{moc.title}</span>
          </nav>
          <span className="mb-2 inline-block rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
            Map of Content
          </span>
          <h1 className="mt-2 text-3xl font-bold text-stone-900">{moc.title}</h1>
          <p className="mt-2 text-lg text-stone-500">{moc.summary}</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {moc.content && (
          <div className="mb-10 text-stone-700 leading-relaxed">
            {moc.content.split("\n\n").map((para, i) =>
              para.trim() ? (
                <p key={i} className="mb-4">{para}</p>
              ) : null
            )}
          </div>
        )}

        {concepts.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
              Concepts in this collection ({concepts.length})
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
                  <p className="mt-0.5 text-sm text-stone-500 line-clamp-2">
                    {c.summary}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
