import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const BUCKET = "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function fail(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function inspectImage(bytes) {
  // Detect the actual container from its signature; never trust multipart MIME metadata.
  if (bytes.length >= 24 &&
      bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG" &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    return { type: "image/png", width, height };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Walk JPEG segments until a Start Of Frame marker supplies dimensions.
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (length < 7) break;
        return { type: "image/jpeg", width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
    return null;
  }

  if (bytes.length >= 30 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes.readUIntLE(24, 3);
      const height = 1 + bytes.readUIntLE(27, 3);
      return { type: "image/webp", width, height };
    }
    return { type: "image/webp" };
  }
  return null;
}

export async function POST(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-product-images:${user.id}`, 20, 60);

    const form = await req.formData();
    const files = form.getAll("files").filter(value => value && typeof value === "object" && typeof value.arrayBuffer === "function");
    if (!files.length || files.length > 12) return fail("Choose between 1 and 12 product images.");

    const prepared = [];
    for (const file of files) {
      if (!ALLOWED.has(file.type)) return fail("Only JPG, PNG and WebP images are allowed.");
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) return fail("Each image must be between 1 byte and 5 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const image = inspectImage(bytes);
      if (!image || image.type !== file.type) return fail("An uploaded file does not match its declared image format.");
      if (image.width !== undefined && image.height !== undefined &&
          (!image.width || !image.height || image.width * image.height > MAX_PIXELS)) {
        return fail("Image dimensions are invalid or exceed the 40-megapixel limit.");
      }
      prepared.push({ bytes, type: image.type });
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
    } else if (!bucket.public) {
      const { error: updateError } = await db.storage.updateBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: [...ALLOWED],
      });
      if (updateError) {
        console.error("Product image bucket configuration failed:", updateError.message);
        return fail("The product-images bucket must allow public reads before uploading storefront images.", 500);
      }
    }

    const uploaded = [];
    for (const item of prepared) {
      const extension = item.type === "image/jpeg" ? "jpg" : item.type === "image/png" ? "png" : "webp";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, item.bytes, {
        contentType: item.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploadError) {
        if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded.map(entry => entry.path));
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