import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://velfrok.vercel.app").replace(/\/+$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
  ];

  try {
    const db = supabaseServer();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await db.from("products")
        .select("id,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      for (const product of data || []) {
        entries.push({
          url: siteUrl + "/products/" + encodeURIComponent(product.id),
          lastModified: product.created_at ? new Date(product.created_at) : undefined,
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.error("Sitemap product query failed:", error);
  }

  return entries;
}