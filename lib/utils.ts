import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Currency is always rendered as JPY (¥) regardless of UI language.
export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Status labels live in the i18n catalogs (status.*); only the colors stay here.
export const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  authorized: "bg-blue-100 text-blue-800 ring-blue-200",
  captured: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  cancelled: "bg-slate-200 text-slate-700 ring-slate-300",
  refunded: "bg-purple-100 text-purple-800 ring-purple-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
};

/** Translate a payment status via the status.* catalog keys, falling back to the raw value. */
export const PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "captured",
  "cancelled",
  "refunded",
  "failed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}
