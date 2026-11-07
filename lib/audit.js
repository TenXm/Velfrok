import { supabaseAdmin } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDetails(details = {}) {
  const allowed = ["paymentMethod", "partner", "awb", "fulfillmentStatus", "result"];
  const output = {};
  for (const key of allowed) {
    const value = details?.[key];
    if (value === undefined) continue;
    if (typeof value === "string") output[key] = value.slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) output[key] = value;
    else if (key === "result" && value && typeof value === "object") {
      output[key] = JSON.parse(JSON.stringify(value).slice(0, 3000));
    }
  }
  return output;
}

export async function audit(event, details = {}) {
  const eventName = typeof event === "string" ? event.slice(0, 100) : "unknown";
  const actorUserId = typeof details.actorId === "string" && UUID_PATTERN.test(details.actorId)
    ? details.actorId
    : null;
  const actorEmail = typeof details.actorEmail === "string" ? details.actorEmail.slice(0, 320) : null;
  const resourceId = typeof details.resourceId === "string" ? details.resourceId.slice(0, 100) : null;
  const ipAddress = typeof details.ipAddress === "string" ? details.ipAddress.slice(0, 100) : null;

  const record = {
    event: eventName,
    actor_user_id: actorUserId,
    actor_email: actorEmail,
    resource_id: resourceId,
    ip_address: ipAddress,
    details: safeDetails(details),
  };

  try {
    const { error } = await supabaseAdmin().from("admin_audit_logs").insert(record);
    if (error) throw error;
    console.info("[AUDIT] persisted", { event: eventName, actorUserId, resourceId });
  } catch (error) {
    // Keep the admin action available if audit storage is temporarily unavailable,
    // while retaining a server-side fallback for operational diagnosis.
    console.error("[AUDIT] Database write failed:", error?.message || error, {
      event: eventName,
      actorUserId,
      resourceId,
      timestamp: new Date().toISOString(),
    });
  }
}

export async function auditLog(actorId, event, details = {}, ipAddress = null) {
  return audit(event, {
    ...details,
    action: event,
    actorId: typeof actorId === "string" ? actorId : null,
    actorEmail: details.actorEmail,
    resourceId: typeof details.id === "string" ? details.id : null,
    ipAddress,
  });
}
