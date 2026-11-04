import type { Metadata } from "next";
import ProductDetail from "@/components/product-detail";
import { supabaseServer } from "@/lib/supabase";

type Props = { params: { sku: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sku = decodeURIComponent(params.sku);
  try {
    const { data } = await supabaseServer()
      .from("products")
      .select("name,description,image_urls,mrp,selling_price,sku")
      .eq("sku", sku)
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return { title: "Product not found | Velfrok" };

    const image = Array.isArray(data.image_urls) ? data.image_urls[0] : undefined;
    const description = (data.description || `Shop ${data.name} at Velfrok.`).slice(0, 160);

    return {
      title: `${data.name} | Velfrok`,
      description,
      openGraph: {
        title: data.name,
        description,
        type: "website",
        ...(image ? { images: [image] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: data.name,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch (error) {
    console.error("Product metadata lookup failed:", error);
    return { title: "Velfrok — Better Living" };
  }
}

export default function ProductPage({ params }: Props) {
  return <ProductDetail identifier={decodeURIComponent(params.sku)} />;
}
