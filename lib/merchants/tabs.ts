// Merchant detail tabs (B) — pure definitions shared by the Server Component
// page and the client views. Loaders live in ./detail (server only).

import type { FeeScheduleView } from "./fees";
import type { LimitInput, LimitUsage } from "./limits";

export const MERCHANT_TABS = ["basic", "contract", "limits", "apikeys", "notify"] as const;
export type MerchantTab = (typeof MERCHANT_TABS)[number];

export function isMerchantTab(v: unknown): v is MerchantTab {
  return typeof v === "string" && (MERCHANT_TABS as readonly string[]).includes(v);
}

export interface MerchantContract {
  schedules: FeeScheduleView[];
  transferDueDays: number;
  refundWindowDays: number;
}

export interface MerchantLimits {
  limits: LimitInput[];
  usage: LimitUsage[];
}
