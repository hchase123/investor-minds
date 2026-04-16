"use client";

import { useState } from "react";
import Link from "next/link";
import type { WikiArticle } from "@/lib/supabase";

interface Props {
  tagGroups: Record<string, WikiArticle[]>;
  mindSlug: string;
}

export default function TagBrowser({ tagGroups, mindSlug }: Props) {
  const [openTags, setOpenTags] = useState<Set<string>>(new Set());

  const sortedTags = Object.entries(tagGroups).sort(
    (a, b) => b[1].length - a[1].length
  );

  function toggle(tag: string) {
    setOpenTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {sortedTags.map(([tag, concepts]) => {
        const isOpen = openTags.has(tag);
        return (
          <div key={tag} className="rounded-xl border border-stone-200 bg-white">
            <button
              onClick={() => toggle(tag)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-stone-50 transition"
            >
              <span className="text-sm font-medium text-stone-700">{tag}</span>
              <span className="flex items-center gap-2 text-xs text-stone-400">
                {concepts.length} concepts
                <svg
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div className="divide-y divide-stone-100 border-t border-stone-100">
                {concepts.map((c) => (
                  <Link
                    key={c.id}
                    href={`/${mindSlug}/${c.slug}`}
                    className="block px-5 py-3 hover:bg-stone-50 transition"
                  >
                    <p className="text-sm font-medium text-stone-900">{c.title}</p>
                    <p className="mt-0.5 text-xs text-stone-500 line-clamp-1">
                      {c.summary}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
