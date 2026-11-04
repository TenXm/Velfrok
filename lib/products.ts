import { supabaseBrowser } from "@/lib/supabase";

export type Product = {
  id: string; name: string; category: string; price: number; mrp: number;
  rating: string; reviews: string; image: string; images: string[];
  badge: string; description: string; createdAt: string; sku: string;
  quantity: number; colours: string[]; attributes: Record<string, string[]>;
  dimensions: string; weight: string;
};

function imageUrl(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.url || value.src || "";
  return "";
}

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabaseBrowser()
    .from("products")
    .select(`
      id, name, sku, description, mrp, selling_price, discount_pct,
      images, colours, attributes, dimensions, weight, quantity, created_at,
      categories ( name )
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase product error:", error.message);
    throw error;
  }

  return (data ?? []).map((item: any) => {
    const images = Array.isArray(item.images) ? item.images.map(imageUrl).filter(Boolean) : [];
    const category = Array.isArray(item.categories) ? item.categories[0]?.name : item.categories?.name;
    const attributes = item.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes)
      ? Object.fromEntries(Object.entries(item.attributes).map(([key, value]) => [
          key,
          (Array.isArray(value) ? value : [value]).filter(v => typeof v === "string" && v.trim()).map(v => v.trim())
        ]))
      : {};
    return {
      id: item.id, name: item.name, sku: item.sku || "",
      category: category || "Uncategorized",
      price: Number(item.selling_price || 0), mrp: Number(item.mrp || 0),
      rating: "", reviews: "New", image: images[0] || "", images,
      badge: item.discount_pct > 0 ? `-${item.discount_pct}%` : "New",
      description: item.description ?? "", createdAt: item.created_at ?? "",
      quantity: Number(item.quantity || 0),
      colours: Array.isArray(item.colours) ? item.colours.filter((v: unknown) => typeof v === "string") : [],
      attributes, dimensions: item.dimensions || "", weight: item.weight || "",
    };
  });
}
