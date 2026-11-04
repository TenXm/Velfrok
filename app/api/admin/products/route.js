import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  categoryName: z.string().trim().min(2).max(80),
  description: z.string().max(10000).default(""),
  imageUrls: z.array(z.string().url().max(2048)).max(12).default([]),
  colors: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  dimensions: z.string().max(80).nullable().default(null),
  weight: z.string().max(40).nullable().default(null),
  mrp: z.number().positive().max(10000000),
  sellingPrice: z.number().positive().max(10000000),
  quantity: z.number().int().min(0).max(1000000),
  isActive: z.boolean().default(true),
}).refine((value) => value.sellingPrice <= value.mrp, {
  message: "Selling price cannot be greater than MRP.",
  path: ["sellingPrice"],
});

const fail = (message, status) => Response.json({ error: message }, { status });

function slugify(value) {
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function authorize(req, key) {
  const { user, error } = await requireAdmin(req);
  if (error) return { error };
  await rateLimit(key + user.id, 40, 60);
  return { user };
}

export async function GET(req) {
  try {
    const auth = await authorize(req, "admin-products-get:");
    if (auth.error) return auth.error;

    const { data, error } = await supabaseAdmin()
      .from("products")
      .select("id,category_id,name,slug,sku,description,image_urls,colors,dimensions,weight,mrp,selling_price,discount_pct,quantity,is_active,created_at,updated_at,categories(name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin products GET:", error.message);
      return fail("Could not load products.", 500);
    }

    return Response.json({ products: data || [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin products GET failed:", error);
    return fail("Server error.", 500);
  }
}

export async function POST(req) {
  try {
    const auth = await authorize(req, "admin-products-post:");
    if (auth.error) return auth.error;

    const raw = await req.json().catch(() => null);
    const parsed = productSchema.safeParse(raw);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid product details.", 400);
    }

    const value = parsed.data;
    const db = supabaseAdmin();
    const categorySlug = slugify(value.categoryName);
    if (!categorySlug) return fail("Invalid category name.", 400);

    const { data: category, error: categoryError } = await db
      .from("categories")
      .upsert({ name: value.categoryName, slug: categorySlug, is_active: true }, { onConflict: "name" })
      .select("id")
      .single();

    if (categoryError || !category) {
      console.error("Product category save failed:", categoryError?.message);
      return fail("Could not save the product category.", 500);
    }

    const { data, error } = await db.from("products").insert({
      category_id: category.id,
      name: value.name,
      slug: slugify(value.name) + "-" + value.sku.toLowerCase(),
      sku: value.sku.toUpperCase(),
      description: value.description,
      image_urls: value.imageUrls,
      colors: value.colors,
      dimensions: value.dimensions || null,
      weight: value.weight || null,
      mrp: value.mrp,
      selling_price: value.sellingPrice,
      quantity: value.quantity,
      is_active: value.isActive,
    }).select("id,sku,name").single();

    if (error) {
      console.error("Product create failed:", error.message);
      return fail(error.code === "23505" ? "That SKU or product slug already exists." : "Could not create product.", 400);
    }

    return Response.json({ product: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin products POST failed:", error);
    return fail("Server error.", 500);
  }
}

export async function PATCH(req) {
  try {
    const auth = await authorize(req, "admin-products-patch:");
    if (auth.error) return auth.error;

    const raw = await req.json().catch(() => null);
    const parsed = productSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.id) {
      return fail(parsed.success ? "Product ID is required." : parsed.error.issues[0]?.message || "Invalid product details.", 400);
    }

    const value = parsed.data;
    const db = supabaseAdmin();
    const categorySlug = slugify(value.categoryName);

    const { data: category, error: categoryError } = await db
      .from("categories")
      .upsert({ name: value.categoryName, slug: categorySlug, is_active: true }, { onConflict: "name" })
      .select("id")
      .single();

    if (categoryError || !category) {
      console.error("Product category update failed:", categoryError?.message);
      return fail("Could not save the product category.", 500);
    }

    const { data, error } = await db.from("products").update({
      category_id: category.id,
      name: value.name,
      slug: slugify(value.name) + "-" + value.sku.toLowerCase(),
      sku: value.sku.toUpperCase(),
      description: value.description,
      image_urls: value.imageUrls,
      colors: value.colors,
      dimensions: value.dimensions || null,
      weight: value.weight || null,
      mrp: value.mrp,
      selling_price: value.sellingPrice,
      quantity: value.quantity,
      is_active: value.isActive,
      updated_at: new Date().toISOString(),
    }).eq("id", value.id).select("id,sku,name").maybeSingle();

    if (error || !data) {
      console.error("Product update failed:", error?.message);
      return fail(error?.code === "23505" ? "That SKU or product slug already exists." : "Could not update product.", 400);
    }

    return Response.json({ product: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin products PATCH failed:", error);
    return fail("Server error.", 500);
  }
}

export async function DELETE(req) {
  try {
    const auth = await authorize(req, "admin-products-delete:");
    if (auth.error) return auth.error;

    const raw = await req.json().catch(() => null);
    const id = typeof raw?.id === "string" ? raw.id : "";
    if (!z.string().uuid().safeParse(id).success) return fail("Invalid product ID.", 400);

    const { data, error } = await supabaseAdmin()
      .from("products")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Product archive failed:", error?.message);
      return fail("Could not archive product.", 400);
    }

    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin products DELETE failed:", error);
    return fail("Server error.", 500);
  }
}
