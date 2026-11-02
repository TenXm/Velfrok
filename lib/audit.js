
export async function audit(event, details = {}) {
  const safeDetails = {
    action:
      typeof details.action === "string"
        ? details.action
        : "unknown",
    actorId:
      typeof details.actorId === "string"
        ? details.actorId
        : null,
    resourceId:
      typeof details.resourceId === "string"
        ? details.resourceId
        : null,
  };

  console.info("[AUDIT]", {
    event: typeof event === "string" ? event : "unknown",
    ...safeDetails,
    timestamp: new Date().toISOString(),
  });
}

export async function auditLog(actor, event, details = {}) {
  return audit(event, {
    action: event,
    actorId: typeof actor === "string" ? actor : null,
    resourceId:
      typeof details.id === "string" ? details.id : null,
  });
}
