import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { GraphData, GraphNode, GraphLink } from "@/components/KnowledgeGraph";
import KnowledgeGraph from "@/components/KnowledgeGraph";

export const metadata = {
  title: "Graph — Warren Buffett · Investor Minds",
  description:
    "Knowledge graph of Warren Buffett's investing principles — concepts from 41 shareholder letters, connected by shared themes.",
};

async function buildGraphData(): Promise<GraphData> {
  const { data: articles } = await supabase
    .from("wiki_articles")
    .select("id, slug, title, tags, wikilinks")
    .eq("mind_slug", "buffett")
    .eq("status", "published");

  if (!articles) return { nodes: [], links: [] };

  const slugToId: Record<string, string> = {};
  const incomingCount: Record<string, number> = {};

  for (const a of articles) {
    slugToId[a.slug] = a.id;
    incomingCount[a.id] = incomingCount[a.id] ?? 0;
  }

  const links: GraphLink[] = [];
  for (const a of articles) {
    for (const wl of a.wikilinks ?? []) {
      const targetId = slugToId[wl];
      if (targetId && targetId !== a.id) {
        links.push({ source: a.id, target: targetId });
        incomingCount[targetId] = (incomingCount[targetId] ?? 0) + 1;
      }
    }
  }

  const nodes: GraphNode[] = articles.map((a) => ({
    id: a.id,
    name: a.title,
    slug: a.slug,
    tags: a.tags ?? [],
    val: Math.max(1, incomingCount[a.id] ?? 0),
    mindSlug: "buffett",
  }));

  return { nodes, links };
}

export default async function GraphPage() {
  const data = await buildGraphData();

  return (
    <div className="flex h-screen flex-col bg-[#0f0f0f]">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/buffett"
            className="text-sm text-white/40 hover:text-white/70 transition"
          >
            ← Warren Buffett
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm text-white/70">Graph</span>
        </div>
        <p className="text-xs text-white/30">
          {data.nodes.length} concepts · {data.links.length} connections
        </p>
      </header>

      <div className="flex-1 overflow-hidden">
        <KnowledgeGraph data={data} mindSlug="buffett" />
      </div>
    </div>
  );
}
