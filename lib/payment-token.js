import { randomUUID } from "node:crypto";

export function newPaymentToken() {
  return randomUUID();
}
