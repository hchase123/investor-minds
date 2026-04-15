import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---------------------------------------------------------------------------
// Types mirroring the DB schema
// ---------------------------------------------------------------------------

export interface WikiArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  type: string;
  status: string;
  tags: string[];
  topic: string | null;
  source_ids: string[];
  wikilinks: string[];
  content_fingerprint: string | null;
  created_at: string;
  updated_at: string;
  author: string | null;
  mind_slug: string | null;
}

export interface Thought {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  source_type: string;
  author: string | null;
  mind_slug: string | null;
  year: number | null;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getConceptsByMind(mindSlug: string): Promise<WikiArticle[]> {
  const { data, error } = await supabase
    .from("wiki_articles")
    .select("*")
    .eq("mind_slug", mindSlug)
    .eq("status", "published")
    .order("title");

  if (error) throw error;
  return data ?? [];
}

export async function getConceptBySlug(slug: string): Promise<WikiArticle | null> {
  const { data, error } = await supabase
    .from("wiki_articles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return null;
  return data;
}

export async function getMOCsByMind(mindSlug: string): Promise<WikiArticle[]> {
  const { data, error } = await supabase
    .from("wiki_articles")
    .select("*")
    .eq("mind_slug", mindSlug)
    .eq("type", "moc")
    .eq("status", "published")
    .order("title");

  if (error) throw error;
  return data ?? [];
}

export async function getLettersByMind(mindSlug: string): Promise<Thought[]> {
  const { data, error } = await supabase
    .from("thoughts")
    .select("*")
    .eq("mind_slug", mindSlug)
    .order("year");

  if (error) throw error;
  return data ?? [];
}

export async function searchConcepts(
  mindSlug: string,
  query: string
): Promise<WikiArticle[]> {
  const { data, error } = await supabase
    .from("wiki_articles")
    .select("*")
    .eq("mind_slug", mindSlug)
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
    .eq("status", "published")
    .limit(20);

  if (error) throw error;
  return data ?? [];
}
