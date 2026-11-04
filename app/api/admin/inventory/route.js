import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, supabaseForUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const changeSchema = z.object({
  product_id: z.string().uuid(),
  operation: z.enum(["add", "deduct", "set"]),
  quantity: z.number().int().min(0).max(1000000),
});

const fail = (message, status) => Response.json({ error: message }, { status });

export async function GET(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-inventory-get:${user.id}`, 40, 60);

    const { data, error: dbError } = await supabaseAdmin()
      .from("products")
      .select("id,sku,name,quantity,is_active,categories(name)")
      .order("name", { ascending: true });

    if (dbError) {
      console.error("Inventory lookup failed:", dbError.message);
      return fail("Could not load inventory.", 500);
    }

    return Response.json({ products: data || [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin inventory GET failed:", error);
    return fail("Server error.", 500);
  }
}

export async function PATCH(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-inventory-patch:${user.id}`, 20, 60);

    const body = await req.json().catch(() => null);
    const parsed = z.array(changeSchema).min(1).max(100).safeParse(body?.changes);
    if (!parsed.success) {
      return fail(parsed.error?.issues?.[0]?.message || "Invalid inventory changes.", 400);
    }

    const unique = new Set(parsed.data.map((item) => item.product_id));
    if (unique.size !== parsed.data.length) {
      return fail("Each product may appear only once in a bulk update.", 400);
    }

    const { data, error: rpcError } = await supabaseForUser(req).rpc(
      "admin_adjust_inventory",
      { p_changes: parsed.data }
    );

    if (rpcError) {
      console.error("Atomic inventory adjustment failed:", rpcError.message);
      return fail("Inventory was not changed. Verify admin access and stock values.", 409);
    }

    return Response.json({ ok: true, updated: data || [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin inventory PATCH failed:", error);
    return fail("Server error.", 500);
  }
}
