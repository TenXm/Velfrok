const URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function rateLimitError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function rateLimit(key, limit = 10, windowSec = 60) {
  if (!URL || !TOKEN) {
    throw rateLimitError("Rate limiting is not configured", 503);
  }

  if (
    typeof key !== "string" ||
    !key.trim() ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isInteger(windowSec) ||
    windowSec < 1
  ) {
    throw rateLimitError("Invalid rate limit configuration", 500);
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

  if (!response.ok) {
    throw rateLimitError("Rate limiting service is unavailable", 503);
  }

  let results;

  try {
    results = await response.json();
  } catch {
    throw rateLimitError("Invalid response from rate limiting service", 503);
  }

  const count = results?.[0]?.result;

  if (!Number.isFinite(count)) {
    throw rateLimitError("Invalid response from rate limiting service", 503);
  }

  if (count > limit) {
    throw rateLimitError("Too many requests", 429);
  }

  return count;
}

export function clientIp(req) {
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
