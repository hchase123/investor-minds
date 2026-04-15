import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { WikiArticle } from "@/lib/supabase";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getConcept(slug: string): Promise<WikiArticle | null> {
  const { data } = await supabase
    .from("wiki_articles")
    .select("*")
    .eq("slug", slug)
    .eq("mind_slug", "buffett")
    .single();
  return data ?? null;
}

async function getLinkedConcepts(slugs: string[]): Promise<Pick<WikiArticle, "id" | "slug" | "title" | "summary">[]> {
  if (slugs.length === 0) return [];
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, slug, title, summary")
    .eq("mind_slug", "buffett")
    .in("slug", slugs);
  return data ?? [];
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const article = await getConcept(slug);
  if (!article) return { title: "Not Found" };
  return {
    title: `${article.title} — Warren Buffett · Investor Minds`,
    description: article.summary,
  };
}

function renderContent(content: string) {
  // Render [[wikilink]] as internal links, rest as paragraphs
  const lines = content.split("\n\n");
  return lines.map((para, i) => {
    if (!para.trim()) return null;
    const parts = para.split(/(\[\[.*?\]\])/g);
    return (
      <p key={i} className="mb-4 leading-relaxed text-stone-700">
        {parts.map((part, j) => {
          const m = part.match(/^\[\[(.*?)\]\]$/);
          if (m) {
            const slug = m[1].toLowerCase().replace(/\s+/g, "-");
            return (
              <Link
                key={j}
                href={`/buffett/${slug}`}
                className="font-medium text-amber-700 underline decoration-amber-200 underline-offset-2 hover:decoration-amber-500"
              >
                {m[1]}
              </Link>
            );
          }
          return <span key={j}>{part}</span>;
        })}
      </p>
    );
  });
}

export default async function ConceptPage({ params }: Props) {
  const { slug } = await params;
  const article = await getConcept(slug);
  if (!article) notFound();

  const linked = await getLinkedConcepts(article.wikilinks ?? []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <nav className="mb-4 flex gap-2 text-sm text-stone-400">
            <Link href="/" className="hover:text-stone-600">Investor Minds</Link>
            <span>/</span>
            <Link href="/buffett" className="hover:text-stone-600">Warren Buffett</Link>
            <span>/</span>
            <span className="text-stone-600">{article.title}</span>
          </nav>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-stone-900">{article.title}</h1>
              <p className="mt-2 text-lg text-stone-500">{article.summary}</p>
            </div>
          </div>
          {article.tags?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Main content */}
          <article className="lg:col-span-2 prose-sm">
            {renderContent(article.content)}
          </article>

          {/* Linked concepts sidebar */}
          {linked.length > 0 && (
            <aside>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-400">
                Linked Concepts
              </h3>
              <div className="space-y-2">
                {linked.map((c) => (
                  <Link
                    key={c.id}
                    href={`/buffett/${c.slug}`}
                    className="block rounded-lg border border-stone-200 bg-white p-3 hover:shadow-sm transition"
                  >
                    <p className="text-sm font-medium text-stone-900">{c.title}</p>
                    <p className="mt-0.5 text-xs text-stone-400 line-clamp-2">{c.summary}</p>
                  </Link>
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
