// Server-side loader for the merchant detail tabs (B): contract (fee
// schedules + terms), limits with usage, API keys. Never returns key hashes.

import { prisma } from "@/lib/db";
import { FEE_METHODS, toFeeScheduleViews } from "./fees";
import { limitsView, usageFor } from "./limits";
import { API_KEY_SELECT, toApiKeyView, type ApiKeyView } from "./api-keys";
import type { DataMode } from "@/lib/mode";
import type { MerchantContract, MerchantLimits } from "./tabs";

export { MERCHANT_TABS, isMerchantTab, type MerchantTab, type MerchantContract, type MerchantLimits } from "./tabs";

export async function loadMerchantContract(merchantId: string, now: Date = new Date()): Promise<MerchantContract | null> {
  const [merchant, rows] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId }, select: { transferDueDays: true, refundWindowDays: true } }),
    prisma.merchantFeeSchedule.findMany({ where: { merchantId }, orderBy: { effectiveFrom: "desc" }, select: { id: true, plan: true, rates: true, effectiveFrom: true, note: true, createdAt: true } }),
  ]);
  if (!merchant) return null;
  return { schedules: toFeeScheduleViews(rows, now), transferDueDays: merchant.transferDueDays, refundWindowDays: merchant.refundWindowDays };
}

export async function loadMerchantLimits(merchantId: string, mode: DataMode, now: Date = new Date()): Promise<MerchantLimits> {
  const rows = await prisma.merchantLimit.findMany({ where: { merchantId } });
  const usage = await Promise.all(FEE_METHODS.map((method) => usageFor(prisma, { merchantId, method, livemode: mode === "live", now })));
  return { limits: limitsView(rows), usage };
}

export async function loadMerchantApiKeys(merchantId: string, now: Date = new Date()): Promise<ApiKeyView[]> {
  const rows = await prisma.apiKey.findMany({ where: { merchantId }, orderBy: [{ mode: "asc" }, { kind: "asc" }, { issuedAt: "desc" }], select: API_KEY_SELECT });
  return rows.map((r) => toApiKeyView(r, now));
}
