"import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase";
import ProductDetailClient from "./product-detail-client";

type ProductSeoRecord = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  mrp: number | string | null;
  selling_price: number | string | null;
  images: unknown;
  quantity: number | null;
  categories: { name?: string } | { name?: string }[] | null;
};

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://velfrok.vercel.app").replace(/\\/+$/, "");

function imageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const item = entry as { url?: unknown; src?: unknown };
      if (typeof item.url === "string") return item.url;
      if (typeof item.src === "string") return item.src;
    }
    return "";
  }).filter((url): url is string => /^https?:\\/\\//i.test(url));
}

async function getSeoProduct(id: string): Promise<ProductSeoRecord | null> {
  if (!id) return null;
  try {
    const { data, error } = await supabaseServer()
      .from("products")
      .select("id,name,sku,description,mrp,selling_price,images,quantity,categories(name)")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) {
      console.error("Product SEO lookup failed:", error.message);
      return null;
    }
    return data as ProductSeoRecord | null;
  } catch (error) {
    console.error("Product SEO lookup failed:", error);
    return null;
  }
}

function productDescription(product: ProductSeoRecord): string {
  const description = (product.description || "").replace(/\\s+/g, " ").trim();
  return (description || `Shop ${product.name} at Velfrok. Check product details, price and availability.`).slice(0, 160);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getSeoProduct(id);
  if (!product) {
    return {
      title: "Product unavailable | Velfrok",
      robots: { index: false, follow: false },
    };
  }

  const canonical = `${siteUrl}/products/${encodeURIComponent(product.id)}`;
  const images = imageUrls(product.images);
  const price = Number(product.selling_price || 0);
  const description = productDescription(product);

  return {
    title: `${product.name} | Velfrok`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "Velfrok",
      title: `${product.name} | Velfrok`,
      description,
      images: images.map((url) => ({ url, alt: product.name })),
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: `${product.name} | Velfrok`,
      description,
      images,
    },
    other: {
      "product:price:amount": price.toFixed(2),
      "product:price:currency": "INR",
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getSeoProduct(id);
  const images = product ? imageUrls(product.images) : [];
  const categoryValue = product?.categories;
  const category = Array.isArray(categoryValue) ? categoryValue[0]?.name : categoryValue?.name;
  const price = Number(product?.selling_price || 0);
  const schema = product ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku || undefined,
    description: productDescription(product),
    image: images.length ? images : undefined,
    category: category || undefined,
    brand: { "@type": "Brand", name: "Velfrok" },
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/products/${encodeURIComponent(product.id)}`,
      priceCurrency: "INR",
      price: price.toFixed(2),
      availability: Number(product.quantity || 0) > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  } : null;

  return (
    <>
      {schema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\\\u003c") }}
        />
      )}
      <ProductDetailClient />
    </>
  );
}
