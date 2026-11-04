import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
  discountType: z.enum(["percentage", "flat"]),
  discountValue: z.number().positive().max(1000000),
  minOrderValue: z.number().min(0).max(10000000),
  maxDiscount: z.number().positive().max(10000000).nullable(),
  expiresAt: z.string().datetime().nullable(),
  usageLimit: z.number().int().positive().max(10000000).nullable(),
  perCustomerLimit: z.number().int().positive().max(100000).nullable(),
  isActive: z.boolean().default(true),
});

const fail = (message, status) => Response.json({ error: message }, { status });

async function authorize(req, key) {
  const { user, error } = await requireAdmin(req);
  if (error) return { error };
  await rateLimit(key + user.id, 30, 60);
  return { user };
}

function toRow(value) {
  return {
    code: value.code.toUpperCase(),
    discount_type: value.discountType,
    discount_value: value.discountValue,
    min_order_value: value.minOrderValue,
    max_discount: value.maxDiscount,
    expires_at: value.expiresAt,
    usage_limit: value.usageLimit,
    per_customer_limit: value.perCustomerLimit,
    is_active: value.isActive,
  };
}

export async function GET(req) {
  try {
    const auth = await authorize(req, "admin-coupons-get:");
    if (auth.error) return auth.error;
    const { data, error } = await supabaseAdmin()
      .from("coupons")
      .select("id,code,discount_type,discount_value,min_order_value,max_discount,expires_at,usage_limit,per_customer_limit,usage_count,is_active,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Coupons lookup failed:", error.message);
      return fail("Could not load coupons.", 500);
    }
    return Response.json({ coupons: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin coupons GET failed:", error);
    return fail("Server error.", 500);
  }
}

export async function POST(req) {
  try {
    const auth = await authorize(req, "admin-coupons-post:");
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid coupon.", 400);
    const value = parsed.data;
    if (value.discountType === "percentage" && value.discountValue > 100) {
      return fail("Percentage discount cannot exceed 100.", 400);
    }
    const { data, error } = await supabaseAdmin().from("coupons")
      .insert(toRow(value)).select("id,code").single();
    if (error) {
      console.error("Coupon create failed:", error.message);
      return fail(error.code === "23505" ? "That coupon code already exists." : "Could not create coupon.", 400);
    }
    return Response.json({ coupon: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin coupons POST failed:", error);
    return fail("Server error.", 500);
  }
}

export async function PATCH(req) {
  try {
    const auth = await authorize(req, "admin-coupons-patch:");
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success || !parsed.data.id) return fail(parsed.success ? "Coupon ID is required." : parsed.error.issues[0]?.message || "Invalid coupon.", 400);
    const value = parsed.data;
    if (value.discountType === "percentage" && value.discountValue > 100) return fail("Percentage discount cannot exceed 100.", 400);
    const { data, error } = await supabaseAdmin().from("coupons")
      .update(toRow(value)).eq("id", value.id).select("id,code").maybeSingle();
    if (error || !data) {
      console.error("Coupon update failed:", error?.message);
      return fail("Could not update coupon.", 400);
    }
    return Response.json({ coupon: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin coupons PATCH failed:", error);
    return fail("Server error.", 500);
  }
}

export async function DELETE(req) {
  try {
    const auth = await authorize(req, "admin-coupons-delete:");
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!z.string().uuid().safeParse(id).success) return fail("Invalid coupon ID.", 400);
    const { error } = await supabaseAdmin().from("coupons").delete().eq("id", id);
    if (error) {
      console.error("Coupon delete failed:", error.message);
      return fail("Could not delete coupon.", 400);
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin coupons DELETE failed:", error);
    return fail("Server error.", 500);
  }
}
