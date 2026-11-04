import { requireAdmin, supabaseForUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const fail = (message, status = 400) => Response.json({ error: message }, { status });

export async function PATCH(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-inventory:${user.id}`, 20, 60);

    let body;
    try { body = await req.json(); } catch { return fail("Invalid request body."); }
    if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 200) {
      return fail("Select between 1 and 200 products.");
    }
    const seen = new Set();
    const items = [];
    for (const item of body.items) {
      const id = typeof item?.product_id === "string" ? item.product_id : "";
      const quantity = Number(item?.quantity);
      if (!/^[0-9a-f-]{36}$/i.test(id) || seen.has(id) || !Number.isInteger(quantity) || quantity < 0 || quantity > 1000000 || !["add", "subtract", "set"].includes(item?.mode)) {
        return fail("One or more inventory changes are invalid.");
      }
      seen.add(id);
      items.push({ product_id: id, quantity, mode: item.mode });
    }

    const db = supabaseForUser(req);
    const { data, error: rpcError } = await db.rpc("admin_adjust_inventory", { p_items: items });
    if (rpcError) {
      console.error("Inventory RPC failed:", rpcError.message);
      return fail("Inventory update failed. Ensure migration 002_admin_catalog.sql has been applied and refresh the dashboard.", 409);
    }
    return Response.json({ ok: true, results: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Inventory PATCH failed:", error);
    return fail("Server error.", 500);
  }
}
