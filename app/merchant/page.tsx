import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { MerchantDashboardView } from "@/components/views/merchant/dashboard-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { livemodeWhere, modeFromCookieStore } from "@/lib/mode";
import { OPEN_STATUSES, SALES_STATUSES } from "@/lib/payments/transitions";
import { loadTransactions, parseTransactionFilters } from "@/lib/payments/list";
import { PAYMENT_STATUSES } from "@/lib/payments/transitions";
import { loadActiveAnnouncements } from "@/lib/announcements/list";
import { startOfDayInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function MerchantHomePage() {
  const m = await requireMerchantPage();
  const mode = modeFromCookieStore(cookies());
  const modeWhere = { merchantId: m.id, ...livemodeWhere(mode) };
  const now = new Date();
  const today = startOfDayInTz(now);
  const [todayAgg, openCount, pendingRefunds, failedWebhooks, nextPayout, recent, announcements] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { ...modeWhere, status: { in: [...SALES_STATUSES] }, capturedAt: { gte: today } } }),
    prisma.payment.count({ where: { ...modeWhere, status: { in: [...OPEN_STATUSES] } } }),
    prisma.refund.count({ where: { ...modeWhere, status: "requested" } }),
    prisma.webhookDelivery.count({ where: { ...modeWhere, status: { in: ["failed", "abandoned", "retrying"] } } }),
    prisma.settlementBatch.findFirst({ where: { ...modeWhere, status: { in: ["confirmed", "scheduled"] } }, orderBy: { scheduledAt: "asc" }, select: { id: true, scheduledAt: true, netAmount: true } }),
    loadTransactions({ allowedStatuses: PAYMENT_STATUSES, filters: { ...parseTransactionFilters(undefined, PAYMENT_STATUSES, mode), merchant: m.id }, page: 1, pageSize: 8, order: "sales", now }),
    loadActiveAnnouncements(m.id, now),
  ]);
  const settings = await prisma.merchant.findUnique({ where: { id: m.id }, select: { emailNotification: true, email: true } });
  return (
    <MerchantDashboardView
      merchant={{ merchantCode: m.merchantCode, siteName: m.siteName, emailNotification: settings?.emailNotification ?? "per_payment", email: settings?.email ?? m.email }}
      stats={{ todayCount: todayAgg._count, todayAmount: todayAgg._sum.amount ?? 0, openCount, pendingRefunds, failedWebhooks, nextPayout: nextPayout ? { id: nextPayout.id, scheduledAt: nextPayout.scheduledAt, netAmount: nextPayout.netAmount } : null }}
      recent={recent.items}
      announcements={announcements.map((a) => ({ id: a.id, kind: a.kind, title: a.title, publishFrom: a.publishFrom }))}
    />
  );
}
