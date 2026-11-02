export async function audit(event, details = {}) {
  const safeDetails = {
    action: typeof details.action === "string"
      ? details.action
      : "unknown",
    actorId: typeof details.actorId === "string"
      ? details.actorId
      : null,
    resourceId: typeof details.resourceId === "string"
      ? details.resourceId
      : null,
  };

  console.info("[AUDIT]", {
    event: typeof event === "string" ? event : "unknown",
    ...safeDetails,
    timestamp: new Date().toISOString(),
  });
}
