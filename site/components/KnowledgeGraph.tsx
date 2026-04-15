"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Dynamically import to avoid SSR issues (uses window/canvas)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

export interface GraphNode {
  id: string;
  name: string;
  slug: string;
  tags: string[];
  val: number; // size (connection count)
  mindSlug: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Tag → color mapping (Obsidian-style: hubs glow, leaves are dim)
const TAG_COLORS: Record<string, string> = {
  startups: "#f59e0b",      // amber
  programming: "#4ade80",   // green
  writing: "#60a5fa",       // blue
  thinking: "#c084fc",      // purple
  technology: "#34d399",    // emerald
  design: "#f472b6",        // pink
  education: "#facc15",     // yellow
  essays: "#94a3b8",        // slate
};

function getNodeColor(node: GraphNode, hovered: string | null): string {
  if (hovered === node.id) return "#ffffff";
  const tag = node.tags?.[0]?.toLowerCase() ?? "";
  return TAG_COLORS[tag] ?? "#94a3b8";
}

function getNodeOpacity(node: GraphNode, hovered: string | null): number {
  if (!hovered) return 0.85;
  return hovered === node.id ? 1 : 0.3;
}

interface Props {
  data: GraphData;
  mindSlug: string;
  height?: number;
}

export default function KnowledgeGraph({ data, mindSlug, height = 700 }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height });

  useEffect(() => {
    function handleResize() {
      setDimensions({
        width: window.innerWidth,
        height: Math.max(500, window.innerHeight - 120),
      });
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNodeClick = useCallback(
    (node: object) => {
      const n = node as GraphNode;
      router.push(`/${mindSlug}/${n.slug}`);
    },
    [router, mindSlug]
  );

  const handleNodeHover = useCallback((node: object | null) => {
    setHovered(node ? (node as GraphNode).id : null);
  }, []);

  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode & { x: number; y: number };
      const color = getNodeColor(n, hovered);
      const opacity = getNodeOpacity(n, hovered);
      const r = Math.sqrt(n.val) * 2.5 + 2;

      ctx.globalAlpha = opacity;

      // Glow for hubs and hovered
      if (n.val > 5 || hovered === n.id) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity * 0.15;
        ctx.fill();
        ctx.globalAlpha = opacity;
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Label for hovered or big nodes
      if (hovered === n.id || n.val > 8) {
        ctx.globalAlpha = opacity;
        ctx.font = `${hovered === n.id ? 13 : 10}px Inter, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(n.name, n.x, n.y + r + 10);
      }

      ctx.globalAlpha = 1;
    },
    [hovered]
  );

  const linkColor = useCallback(
    (link: object) => {
      const l = link as { source: { id: string }; target: { id: string } };
      if (
        hovered &&
        (l.source.id === hovered || l.target.id === hovered)
      ) {
        return "rgba(255,255,255,0.6)";
      }
      return "rgba(255,255,255,0.07)";
    },
    [hovered]
  );

  const linkWidth = useCallback(
    (link: object) => {
      const l = link as { source: { id: string }; target: { id: string } };
      if (
        hovered &&
        (l.source.id === hovered || l.target.id === hovered)
      ) {
        return 1.5;
      }
      return 0.5;
    },
    [hovered]
  );

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[#0f0f0f]" style={{ height: dimensions.height }}>
      {/* Legend */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
        {Object.entries(TAG_COLORS).slice(0, 6).map(([tag, color]) => (
          <div key={tag} className="flex items-center gap-2 text-xs text-white/70">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {tag}
          </div>
        ))}
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 right-4 z-10 text-xs text-white/30">
        scroll to zoom · drag to pan · click to open
      </div>

      {/* Hovered node name */}
      {hovered && (
        <div className="absolute top-4 right-4 z-10 max-w-xs rounded-lg bg-black/70 px-3 py-2 text-sm text-white backdrop-blur-sm">
          {data.nodes.find((n) => n.id === hovered)?.name}
        </div>
      )}

      <ForceGraph2D
        graphData={data}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#0f0f0f"
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => "replace"}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        linkColor={linkColor}
        linkWidth={linkWidth}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        minZoom={0.2}
        maxZoom={8}
      />
    </div>
  );
}
