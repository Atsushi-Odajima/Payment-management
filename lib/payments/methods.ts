// Payment method (決済種別) vocabulary shared by transactions, merchants and
// filters. Mirrors the category keys in lib/providers/registry.ts but is kept
// separate so lightweight modules (Zod schemas, list filters) do not pull in
// the whole provider registry.

export const PAYMENT_METHODS = ["credit", "qr", "convenience", "bank", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

/** Narrow a stored / provider category string, defaulting to "other". */
export function toPaymentMethod(v: string | null | undefined): PaymentMethod {
  return isPaymentMethod(v) ? v : "other";
}
