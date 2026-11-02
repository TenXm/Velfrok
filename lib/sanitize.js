const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

export function clean(value, maxLength = 200) {
  if (typeof value !== "string") {
    return "";
  }

  const limit = Number.isInteger(maxLength) && maxLength > 0
    ? maxLength
    : 200;

  return value
    .replace(CONTROL_CHARACTERS, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, limit);
}

export function cleanPhone(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value)
    .replace(/\D/g, "")
    .slice(-10);
}

export function cleanUtr(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value)
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 40);
}
