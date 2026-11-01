
import { supabase } from "@/lib/supabase";

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  mrp: number;
  rating: string;
  reviews: string;
  image: string;
  badge: string;
  description: string;
};

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      description,
      mrp,
      selling_price,
      discount_pct,
      image_urls,
      categories(name)
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase product error:", error.message);
    return [];
  }

  return (data ?? []).map((item: any) => ({
    id: item.id,
    name: item.name,
    category: item.categories?.name ?? "Everyday Essentials",
    price: Number(item.selling_price),
    mrp: Number(item.mrp),
    rating: "5.0",
    reviews: "New",
    image: item.image_urls?.[0] ?? "",
    badge: item.discount_pct > 0 ? `-${item.discount_pct}%` : "New",
    description: item.description ?? ""
  }));
}
