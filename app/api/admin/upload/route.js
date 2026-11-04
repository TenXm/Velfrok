import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ALLOWED = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function fail(message, status) {
  return Response.json({ error: message }, { status });
}

export async function POST(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-image-upload:${user.id}`, 20, 60);

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) return fail("Choose an image file.", 400);
    const extension = ALLOWED[file.type];
    if (!extension) return fail("Choose a JPG, PNG, or WebP image.", 400);
    if (file.size < 1 || file.size > 2 * 1024 * 1024) {
      return fail("Image size must be 2 MB or less.", 400);
    }

    const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin()
      .storage.from("product-images")
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Product image upload failed:", uploadError.message);
      return fail("Image upload failed. Check that the product-images bucket migration has been applied.", 500);
    }

    const { data } = supabaseAdmin().storage.from("product-images").getPublicUrl(path);
    if (!data?.publicUrl) return fail("Upload completed but no public URL was returned.", 500);

    return Response.json({ url: data.publicUrl }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin image upload failed:", error);
    return fail("Server error.", 500);
  }
}
