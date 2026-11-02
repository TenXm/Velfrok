import { supabaseBrowser } from "@/lib/supabase";

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
  const { data, error } = await supabaseBrowser()
    .from("products")
    .select(`
      id,
      name,
      description,
      mrp,
      selling_price,
      discount_pct,
      images,
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
    const firstImage = Array.isArray(item.images)
      ? item.images[0]
      : null;

    const image =
      typeof firstImage === "string"
        ? firstImage
        : firstImage && typeof firstImage === "object"
          ? firstImage.url || firstImage.src || ""
          : "";

    const category = Array.isArray(item.categories)
      ? item.categories[0]?.name
      : item.categories?.name;

    return {
      id: item.id,
      name: item.name,
      category: category || "Uncategorized",
      price: Number(item.selling_price || 0),
      mrp: Number(item.mrp || 0),
      rating: "",
      reviews: "New",
      image,
      badge:
        item.discount_pct > 0
          ? `-${item.discount_pct}%`
          : "New",
      description: item.description ?? "",
    };
  });
}
