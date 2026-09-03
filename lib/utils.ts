import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PaymentStatus } from "@/lib/payments/transitions";

export { PAYMENT_STATUSES, isPaymentStatus, type PaymentStatus } from "@/lib/payments/transitions";

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
export const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  awaiting_transfer: "bg-sky-100 text-sky-800 ring-sky-200",
  authorized: "bg-blue-100 text-blue-800 ring-blue-200",
  captured: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  partially_refunded: "bg-violet-100 text-violet-800 ring-violet-200",
  refunded: "bg-purple-100 text-purple-800 ring-purple-200",
  cancelled: "bg-slate-200 text-slate-700 ring-slate-300",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
  expired: "bg-orange-100 text-orange-800 ring-orange-200",
};

export const PROVIDER_STATUSES = ["active", "disabled"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export function isProviderStatus(value: unknown): value is ProviderStatus {
  return (
    typeof value === "string" &&
    (PROVIDER_STATUSES as readonly string[]).includes(value)
  );
}

export function toProviderStatus(value: string): ProviderStatus {
  if (!isProviderStatus(value)) throw new Error(`Unknown provider status: ${value}`);
  return value;
}
