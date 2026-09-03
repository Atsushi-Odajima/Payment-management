import { maskEmail, maskName } from "@/lib/pii/mask";
import { cookies } from "next/headers";
import { SubscriptionsView } from "@/components/views/subscriptions-view";
import { prisma } from "@/lib/db";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { RISK_SETTINGS_ID } from "@/lib/risk/types";
import { loadPlans, loadSubscriptions, parseSubscriptionFilters, parseSubscriptionSort } from "@/lib/subscriptions/list";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseSubscriptionFilters(searchParams, mode);
  const sort = parseSubscriptionSort(searchParams);
  const [{ rows, total, merchants, pastDueCount }, plans, setting] = await Promise.all([
    loadSubscriptions({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE }),
    loadPlans(),
    prisma.riskSetting.findUnique({ where: { id: RISK_SETTINGS_ID }, select: { demoChargeFailPercent: true } }),
  ]);
  return <SubscriptionsView rows={rows.map((r) => ({ ...r, customerName: maskName(r.customerName) ?? "", customerEmail: maskEmail(r.customerEmail) }))} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} pastDueCount={pastDueCount} plans={plans} demoFailPercent={setting?.demoChargeFailPercent ?? 20} />;
}
