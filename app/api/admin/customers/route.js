import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const fail = (message, status) => Response.json({ error: message }, { status });

export async function GET(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-customers-get:${user.id}`, 20, 60);

    const url = new URL(req.url);
    const page = Math.max(1, Math.min(100, Number(url.searchParams.get("page")) || 1));
    const { data, error: listError } = await supabaseAdmin().auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (listError) {
      console.error("Admin customer lookup failed:", listError.message);
      return fail("Could not load customer accounts.", 500);
    }

    const customers = (data?.users || []).map((customer) => ({
      id: customer.id,
      email: customer.email || "",
      phone: customer.phone || "",
      created_at: customer.created_at,
      last_sign_in_at: customer.last_sign_in_at,
      email_confirmed_at: customer.email_confirmed_at,
      user_metadata: {
        full_name: customer.user_metadata?.full_name || customer.user_metadata?.name || "",
      },
    }));

    return Response.json({ customers, page, hasMore: customers.length === 100 }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin customers GET failed:", error);
    return fail("Server error.", 500);
  }
}
