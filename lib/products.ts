import { supabaseBrowser } from "@/lib/supabase";

export type Product = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  mrp: number;
  rating: string;
  reviews: string;
  image: string;
  images: string[];
  badge: string;
  description: string;
  createdAt: string;
  stock: number;
  colors: string[];
  dimensions: string | null;
  weight: string | null;
};

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabaseBrowser()
    .from("products")
    .select(`
      id,
      sku,
      slug,
      name,
      description,
      mrp,
      selling_price,
      discount_pct,
      image_urls,
      colors,
      dimensions,
      weight,
      quantity,
      created_at,
      categories (
        name
      )
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase product error:", error.message);
    throw error;
  }

  return (data ?? []).map((item: any) => {
    const images = Array.isArray(item.image_urls)
      ? item.image_urls.filter((url: unknown): url is string => typeof url === "string")
      : [];

    const category = Array.isArray(item.categories)
      ? item.categories[0]?.name
      : item.categories?.name;

    return {
      id: item.id,
      sku: item.sku ?? "",
      slug: item.slug ?? "",
      name: item.name,
      category: category || "Uncategorized",
      price: Number(item.selling_price || 0),
      mrp: Number(item.mrp || 0),
      rating: "",
      reviews: "New",
      image: images[0] || "",
      images,
      badge: Number(item.discount_pct) > 0
        ? `-${item.discount_pct}%`
        : "New",
      description: item.description ?? "",
      createdAt: item.created_at ?? "",
      stock: Number(item.quantity ?? 0),
      colors: Array.isArray(item.colors) ? item.colors : [],
      dimensions: item.dimensions ?? null,
      weight: item.weight ?? null,
    };
  });
}
