import { supabaseAdmin } from "./supabase";

const URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function rateLimitError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function rateLimit(key, limit = 10, windowSec = 60) {
  if (
    typeof key !== "string" || !key.trim() || key.length > 240 ||
    !Number.isInteger(limit) || limit < 1 ||
    !Number.isInteger(windowSec) || windowSec < 1
  ) {
    throw rateLimitError("Invalid rate limit configuration", 500);
  }

  // Prefer Upstash when configured; otherwise use the Supabase database so
  // the application remains usable on the free tier without another service.
  if (!URL || !TOKEN) {
    const { data, error } = await supabaseAdmin().rpc("velfrok_rate_limit_increment", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSec,
    });
    if (error || !Number.isFinite(data)) {
      console.error("Database rate limiter failed:", error?.message || "Invalid result");
      throw rateLimitError("Rate limiting service is unavailable", 503);
    }
    if (data > limit) throw rateLimitError("Too many requests", 429);
    return data;
  }

  let response;
  try {
    response = await fetch(`${URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["EXPIRE", `rl:${key}`, windowSec, "NX"],
      ]),
      cache: "no-store",
    });
  } catch {
    throw rateLimitError("Rate limiting service is unavailable", 503);
  }

  if (!response.ok) throw rateLimitError("Rate limiting service is unavailable", 503);
  let results;
  try { results = await response.json(); }
  catch { throw rateLimitError("Invalid response from rate limiting service", 503); }

  const count = results?.[0]?.result;
  if (!Number.isFinite(count)) throw rateLimitError("Invalid response from rate limiting service", 503);
  if (count > limit) throw rateLimitError("Too many requests", 429);
  return count;
}

export function clientIp(req) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
