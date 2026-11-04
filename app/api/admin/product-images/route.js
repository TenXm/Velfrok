import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const BUCKET = "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function fail(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-product-images:${user.id}`, 20, 60);

    const form = await req.formData();
    const files = form.getAll("files").filter(value => value && typeof value === "object" && typeof value.arrayBuffer === "function");
    if (!files.length || files.length > 12) return fail("Choose between 1 and 12 product images.");

    for (const file of files) {
      if (!ALLOWED.has(file.type)) return fail("Only JPG, PNG and WebP images are allowed.");
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) return fail("Each image must be between 1 byte and 5 MB.");
    }

    const db = supabaseAdmin();
    const { data: bucket } = await db.storage.getBucket(BUCKET);
    if (!bucket) {
      const { error: createError } = await db.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: [...ALLOWED],
      });
      if (createError && !/already exists/i.test(createError.message)) {
        console.error("Product image bucket setup failed:", createError.message);
        return fail("Could not prepare product image storage.", 500);
      }
    }

    const uploaded = [];
    for (const file of files) {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploadError) {
        if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded.map(item => item.path));
        console.error("Product image upload failed:", uploadError.message);
        return fail("An image could not be uploaded. Please try again.", 500);
      }
      const { data } = db.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push({ path, url: data.publicUrl });
    }

    return Response.json({ images: uploaded.map(item => item.url) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Product image upload error:", error);
    return fail("Product image upload failed.", 500);
  }
}
