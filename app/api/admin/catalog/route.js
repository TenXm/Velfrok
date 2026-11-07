import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message, status = 400) => Response.json({ error: message }, { status });
const slugify = (value) =>
  value.toLowerCase().trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const text = (value, max = 5000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function guard(req, key) {
  const auth = await requireAdmin(req);
  if (auth.error) return { error: auth.error };
  await rateLimit(`admin-catalog-${key}:${auth.user.id}`, 60, 60);
  return { user: auth.user };
}

export async function GET(req) {
  try {
    const auth = await guard(req, "get");
    if (auth.error) return auth.error;
    const db = supabaseAdmin();

    const [products, categories, options] = await Promise.all([
      db.from("products").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("categories").select("*").order("name"),
      db.from("product_attribute_options").select("*").eq("is_active", true).order("attribute_name").order("value"),
    ]);

    const error = products.error || categories.error || options.error;
    if (error) {
      console.error("Admin catalogue load failed:", error.message);
      return fail("Could not load catalogue. Apply migration 002_admin_catalog.sql if attribute options are unavailable.", 500);
    }

    return Response.json({
      products: products.data || [],
      categories: categories.data || [],
      options: options.data || [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin catalogue GET failed:", error);
    return fail("Server error.", 500);
  }
}

export async function POST(req) {
  try {
    const auth = await guard(req, "post");
    if (auth.error) return auth.error;
    let body;
    try { body = await req.json(); } catch { return fail("Invalid request body."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request.");

    const db = supabaseAdmin();

    if (body.action === "category") {
      const name = text(body.name, 80);
      const slug = slugify(name);
      if (!name || !slug) return fail("Enter a valid category name.");
      const { data: matchingCategory, error: categoryLookupError } = await db.from("categories")
        .select("*").eq("slug", slug).limit(1).maybeSingle();
      if (categoryLookupError) return fail("Could not check existing categories.", 500);
      if (matchingCategory) return Response.json({ category: matchingCategory, existing: true });
      const { data, error } = await db.from("categories")
        .insert({ name, slug }).select("*").single();
      if (error) {
        if (error.code === "23505") {
          const { data: existing } = await db.from("categories").select("*").eq("slug", slug).maybeSingle();
          if (existing) return Response.json({ category: existing, existing: true });
          return fail("A category with this name already exists.", 409);
        }
        console.error("Category create failed:", error.message);
        return fail("Could not create category.", 500);
      }
      return Response.json({ category: data }, { status: 201 });
    }

    if (body.action === "option") {
      const attributeName = text(body.attributeName, 60);
      const value = text(body.value, 80);
      const attributeSlug = slugify(attributeName);
      const normalizedValue = value.toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
      if (!attributeName || !attributeSlug || !value) return fail("Enter both a parameter name and value.");
      const { data, error } = await db.from("product_attribute_options")
        .insert({ attribute_name: attributeName, attribute_slug: attributeSlug, value, normalized_value: normalizedValue })
        .select("*").single();
      if (error) {
        if (error.code === "23505") {
          const { data: existing } = await db.from("product_attribute_options")
            .select("*").eq("attribute_slug", attributeSlug).eq("normalized_value", normalizedValue).maybeSingle();
          if (existing?.is_active) return Response.json({ option: existing, existing: true });
          if (existing && !existing.is_active) {
            const { data: restored, error: restoreError } = await db.from("product_attribute_options")
              .update({ is_active: true, value }).eq("id", existing.id).select("*").single();
            if (!restoreError && restored) return Response.json({ option: restored, restored: true });
          }
          return fail("This option already exists.", 409);
        }
        console.error("Attribute option create failed:", error.message);
        return fail("Could not add this parameter option. Apply the admin catalogue migration first.", 500);
      }
      return Response.json({ option: data }, { status: 201 });
    }

    if (body.action === "product") {
      const product = normalizeProduct(body.product);
      if (product.error) return fail(product.error);
      const [skuMatch, slugMatch] = await Promise.all([
        db.from("products").select("id").eq("sku", product.value.sku).limit(1).maybeSingle(),
        db.from("products").select("id").eq("slug", product.value.slug).limit(1).maybeSingle(),
      ]);
      if (skuMatch.error || slugMatch.error) return fail("Could not check for duplicate product details.", 500);
      if (skuMatch.data || slugMatch.data) return fail("SKU or product URL already exists. Use a unique SKU/name.", 409);
      const { data, error } = await db.from("products").insert(product.value).select("*").single();
      if (error) {
        console.error("Product create failed:", error.message);
        return fail(error.code === "23505" ? "Product name, SKU or slug already exists." : "Could not create product.", error.code === "23505" ? 409 : 500);
      }
      await audit("product.create", {
        actorId: auth.user.id, actorEmail: auth.user.email || null, resourceId: data.id,
        ipAddress: clientIp(req), productName: data.name, sku: data.sku, quantity: data.quantity, isActive: data.is_active,
      });
      return Response.json({ product: data }, { status: 201 });
    }

    return fail("Unknown catalogue action.");
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin catalogue POST failed:", error);
    return fail("Server error.", 500);
  }
}

function normalizeProduct(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Invalid product details." };
  const name = text(input.name, 160);
  const sku = text(input.sku, 60).toUpperCase().replace(/\s+/g, "-");
  const categoryId = input.category_id || null;
  const mrp = Number(input.mrp);
  const sellingPrice = Number(input.selling_price);
  const quantity = Number(input.quantity);
  const gstRate = Number(input.gst_rate ?? 0);
  const colours = Array.isArray(input.colours) ? [...new Set(input.colours.map(v => text(v, 40)).filter(Boolean))].slice(0, 30) : [];
  const images = Array.isArray(input.images) ? input.images.map(v => text(v, 1000)).filter(v => /^https?:\/\//i.test(v)).slice(0, 12) : [];
  const attributes = input.attributes && typeof input.attributes === "object" && !Array.isArray(input.attributes) ? input.attributes : {};
  if (!name || !sku || !/^[A-Z0-9_-]{2,60}$/.test(sku)) return { error: "Enter a product name and valid SKU (letters, numbers, hyphens or underscores)." };
  if (!Number.isFinite(mrp) || !Number.isFinite(sellingPrice) || mrp <= 0 || sellingPrice <= 0 || sellingPrice > mrp) return { error: "Selling price must be positive and cannot exceed MRP." };
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) return { error: "Enter a valid stock quantity." };
  if (![0, 5, 10, 12, 18, 28].includes(gstRate)) return { error: "Choose a supported GST rate." };
  if (categoryId && !UUID.test(categoryId)) return { error: "Invalid category." };
  const slug = slugify(text(input.slug, 160) || name);
  if (!slug) return { error: "Enter a valid product name." };
  const cleanAttributes = {};
  for (const [key, values] of Object.entries(attributes).slice(0, 30)) {
    const attributeKey = slugify(key);
    const list = Array.isArray(values) ? values : [values];
    const cleaned = [...new Set(list.map(v => text(v, 80)).filter(Boolean))].slice(0, 30);
    if (attributeKey && cleaned.length) cleanAttributes[attributeKey] = cleaned;
  }
  return { value: {
    name, sku, slug, category_id: categoryId,
    description: text(input.description, 10000) || null,
    mrp, selling_price: sellingPrice, gst_rate: gstRate,
    quantity, images, colours,
    dimensions: text(input.dimensions, 100) || null,
    weight: text(input.weight, 60) || null,
    attributes: cleanAttributes,
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  }};
}

export async function PATCH(req) {
  try {
    const auth = await guard(req, "patch");
    if (auth.error) return auth.error;
    let body;
    try { body = await req.json(); } catch { return fail("Invalid request body."); }
    if (body?.action === "option") {
      const id = body.id || "";
      const value = text(body.value, 80);
      if (!UUID.test(id) || !value) return fail("Invalid parameter option.");
      const normalizedValue = value.toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
      const { data, error } = await supabaseAdmin().from("product_attribute_options")
        .update({ value, normalized_value: normalizedValue })
        .eq("id", id).eq("is_active", true).select("*").maybeSingle();
      if (error) {
        console.error("Parameter option update failed:", error.message);
        return fail(error.code === "23505" ? "That option already exists." : "Could not update option.", error.code === "23505" ? 409 : 500);
      }
      if (!data) return fail("Parameter option not found.", 404);
      return Response.json({ option: data });
    }
    if (body?.action !== "product" || !UUID.test(body.id || "")) return fail("Invalid product update.");
    const normalized = normalizeProduct(body.product);
    if (normalized.error) return fail(normalized.error);
    const db = supabaseAdmin();
    const [skuMatch, slugMatch] = await Promise.all([
      db.from("products").select("id").eq("sku", normalized.value.sku).neq("id", body.id).limit(1).maybeSingle(),
      db.from("products").select("id").eq("slug", normalized.value.slug).neq("id", body.id).limit(1).maybeSingle(),
    ]);
    if (skuMatch.error || slugMatch.error) return fail("Could not check for duplicate product details.", 500);
    if (skuMatch.data || slugMatch.data) return fail("SKU or product URL already exists. Use a unique SKU/name.", 409);
    const { data, error } = await db.from("products")
      .update(normalized.value).eq("id", body.id).select("*").maybeSingle();
    if (error) {
      console.error("Product update failed:", error.message);
      return fail(error.code === "23505" ? "Product name, SKU or slug already exists." : "Could not update product.", error.code === "23505" ? 409 : 500);
    }
    if (!data) return fail("Product not found.", 404);
    await audit("product.update", {
      actorId: auth.user.id, actorEmail: auth.user.email || null, resourceId: data.id,
      ipAddress: clientIp(req), productName: data.name, sku: data.sku, isActive: data.is_active,
    });
    return Response.json({ product: data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin catalogue PATCH failed:", error);
    return fail("Server error.", 500);
  }
}

export async function DELETE(req) {
  try {
    const auth = await guard(req, "delete");
    if (auth.error) return auth.error;
    const params = new URL(req.url).searchParams;
    const optionId = params.get("optionId") || "";
    if (optionId) {
      if (!UUID.test(optionId)) return fail("Invalid parameter option ID.");
      const { data, error } = await supabaseAdmin().from("product_attribute_options")
        .update({ is_active: false }).eq("id", optionId).eq("is_active", true).select("id,is_active").maybeSingle();
      if (error) { console.error("Parameter option archive failed:", error.message); return fail("Could not remove parameter option.", 500); }
      if (!data) return fail("Parameter option not found.", 404);
      return Response.json({ ok: true, option: data });
    }
    const id = params.get("id") || "";
    if (!UUID.test(id)) return fail("Invalid product ID.");
    const { data, error } = await supabaseAdmin().from("products")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id).select("id,name,sku,is_active").maybeSingle();
    if (error) {
      console.error("Product archive failed:", error.message);
      return fail("Could not archive product.", 500);
    }
    if (!data) return fail("Product not found.", 404);
    await audit("product.archive", {
      actorId: auth.user.id, actorEmail: auth.user.email || null, resourceId: data.id,
      ipAddress: clientIp(req), productName: data.name, sku: data.sku, isActive: data.is_active,
    });
    return Response.json({ ok: true, product: data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin catalogue DELETE failed:", error);
    return fail("Server error.", 500);
  }
}
