"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchConcepts } from "@/lib/supabase";
import type { WikiArticle } from "@/lib/supabase";

interface Props {
  mindSlug: string;
}

export default function ConceptSearch({ mindSlug }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikiArticle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchConcepts(mindSlug, query.trim());
        const concepts = data.filter((d) => d.type !== "moc");
        setResults(concepts);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, mindSlug]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = useCallback(
    (slug: string) => {
      setIsOpen(false);
      setQuery("");
      router.push(`/${mindSlug}/${slug}`);
    },
    [router, mindSlug]
  );

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search concepts…"
          className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-10 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
        />
      </div>

      {isOpen && (
        <div className="absolute top-full z-20 mt-1 w-full rounded-xl border border-stone-200 bg-white shadow-lg">
          {results.length > 0 ? (
            <div className="max-h-72 overflow-y-auto py-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r.slug)}
                  className="block w-full px-4 py-3 text-left hover:bg-stone-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-900">{r.title}</p>
                    {r.tags?.length > 0 && (
                      <span className="ml-2 shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                        {r.tags[0]}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500 line-clamp-1">
                    {r.summary}
                  </p>
                </button>
              ))}
            </div>
          ) : !isLoading ? (
            <p className="px-4 py-3 text-sm text-stone-400">No results found</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
