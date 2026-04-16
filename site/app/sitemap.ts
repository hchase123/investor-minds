import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://investor-minds.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/paul-graham`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/paul-graham/graph`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/buffett`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/buffett/graph`, changeFrequency: "weekly", priority: 0.7 },
  ];

  // Fetch all published articles (concepts + MOCs) for both minds
  const { data: articles } = await supabase
    .from("wiki_articles")
    .select("slug, type, mind_slug, updated_at")
    .eq("status", "published")
    .in("mind_slug", ["paul-graham", "buffett"]);

  const dynamicPages: MetadataRoute.Sitemap = (articles ?? []).map((a) => {
    const prefix = a.type === "moc" ? `${a.mind_slug}/moc` : a.mind_slug;
    return {
      url: `${baseUrl}/${prefix}/${a.slug}`,
      lastModified: a.updated_at,
      changeFrequency: "monthly" as const,
      priority: a.type === "moc" ? 0.8 : 0.6,
    };
  });

  return [...staticPages, ...dynamicPages];
}
