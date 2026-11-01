import ProductGrid from "@/components/ProductGrid";
import { supabaseServer } from "@/lib/supabase";

export const revalidate = 60;

export default async function Home() {
  const { data, error } = await supabaseServer()
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load storefront products:", error.message);
  }

  const products = (data || []).map((product) => {
    const images = Array.isArray(product.images) ? product.images : [];
    const firstImage = images[0];

    const imageUrl =
      typeof firstImage === "string"
        ? firstImage
        : firstImage && typeof firstImage === "object"
          ? firstImage.url || firstImage.src || null
          : null;

    return {
      ...product,
      price_inr: Number(product.selling_price || 0),
      stock: Number(product.quantity || 0),
      image_url: imageUrl,
    };
  });

  return (
    <>
      <section className="hero">
        <h1>VELFROK</h1>
        <p>Better living.</p>
      </section>

      <ProductGrid products={products} />
    </>
  );
}
