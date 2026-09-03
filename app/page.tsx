import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { livemodeWhere, modeFromCookieStore } from "@/lib/mode";
import { prisma } from "@/lib/db";
import { DashboardView, type DashboardStats } from "@/components/views/dashboard-view";
import { currentAdminFromCookies } from "@/lib/admin/page-guard";
import { OPEN_STATUSES, SALES_STATUSES } from "@/lib/payments/transitions";
import { MANUAL_CHAPTERS } from "@/lib/manual/chapters";
import { startOfDayInTz, startOfMonthInTz } from "@/lib/time";
import { buildAgentFees, parseAgentFeeFilters } from "@/lib/agent-fees/service";
import { unreadCount } from "@/lib/notifications/list";

export const dynamic = "force-dynamic";

/** The entry screen asks for a login once; the session then covers every page. */
export default async function DashboardPage() {
  const admin = await currentAdminFromCookies();
  if (!admin) redirect("/login");

  const now = new Date();
  const today = startOfDayInTz(now);
  const mode = modeFromCookieStore(cookies());
  const modeWhere = livemodeWhere(mode);
  const [merchantCount, agentCount, todayAgg, openCount, overdueCount, activeIpRuleCount, adminCount, auditTodayCount, providerCount, pendingRefundCount, settlementOpenCount, settlementScheduled, webhookFailedCount, chargebackOpenCount, blacklistCandidateCount, depositDiffOpenCount, monthAgg, emailTodayCount, announcementActiveCount, templateEnabledCount, subscriptionActiveCount, subscriptionAttentionCount, paymentLinkActiveCount, agentFees, unmatchedDepositCount] =
    await Promise.all([
      prisma.merchant.count(),
      prisma.agent.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { ...modeWhere, status: { in: [...SALES_STATUSES] }, capturedAt: { gte: today } },
      }),
      prisma.payment.count({ where: { ...modeWhere, status: { in: [...OPEN_STATUSES] } } }),
      prisma.payment.count({ where: { ...modeWhere, transferDueAt: { lt: now }, OR: [{ status: "awaiting_transfer" }, { status: "pending", cvsReceiptNo: { not: null } }] } }),
      prisma.ipRestriction.count({ where: { enabled: true } }),
      prisma.adminUser.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      prisma.paymentProvider.count({ where: { status: "active" } }),
      prisma.refund.count({ where: { ...modeWhere, status: "requested" } }),
      prisma.settlementBatch.count({ where: { ...modeWhere, status: { in: ["collecting", "confirmed", "held"] } } }),
      prisma.settlementBatch.aggregate({ _sum: { netAmount: true }, where: { ...modeWhere, status: "scheduled" } }),
      prisma.webhookDelivery.count({ where: { ...modeWhere, status: { in: ["failed", "abandoned", "retrying"] } } }),
      prisma.chargeback.count({ where: { ...modeWhere, status: { in: ["received", "disputed"] } } }),
      prisma.blacklist.count({ where: { status: "candidate" } }),
      prisma.payment.count({ where: { ...modeWhere, depositDiff: { in: ["short", "excess"] }, depositDiffStatus: "open" } }),
      prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { ...modeWhere, status: { in: [...SALES_STATUSES] }, capturedAt: { gte: startOfMonthInTz(now) } } }),
      prisma.emailLog.count({ where: { createdAt: { gte: today } } }),
      prisma.announcement.count({ where: { status: "published", publishFrom: { lte: now }, OR: [{ publishUntil: null }, { publishUntil: { gt: now } }] } }),
      prisma.emailTemplate.count({ where: { enabled: true } }),
      prisma.subscription.count({ where: { ...modeWhere, status: { in: ["trialing", "active"] } } }),
      prisma.subscription.count({ where: { ...modeWhere, status: { in: ["past_due", "suspended"] } } }),
      prisma.paymentLink.count({ where: { ...modeWhere, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
      buildAgentFees(parseAgentFeeFilters(undefined, mode, now)),
      prisma.unmatchedDeposit.count({ where: { ...modeWhere, status: "unmatched" } }),
    ]);
  const customerCount = await prisma.customer.count({ where: { anonymizedAt: null } });

  const unreadNotificationCount = await unreadCount(prisma, admin);
  const stats: DashboardStats = {
    unreadNotificationCount,
    unmatchedDepositCount,
    subscriptionActiveCount,
    subscriptionAttentionCount,
    paymentLinkActiveCount,
    agentFeeMonthAmount: agentFees.rows.reduce((s, r) => s + r.fee, 0),
    pendingRefundCount,
    webhookFailedCount,
    chargebackOpenCount,
    blacklistCandidateCount,
    depositDiffOpenCount,
    monthPaymentCount: monthAgg._count,
    monthPaymentAmount: monthAgg._sum.amount ?? 0,
    emailTodayCount,
    announcementActiveCount,
    templateEnabledCount,
    settlementOpenCount,
    settlementScheduledAmount: settlementScheduled._sum.netAmount ?? 0,
    merchantCount,
    customerCount,
    agentCount,
    todayPaymentCount: todayAgg._count,
    todayPaymentAmount: todayAgg._sum.amount ?? 0,
    openTransactionCount: openCount,
    overdueTransferCount: overdueCount,
    activeIpRuleCount,
    adminCount,
    auditTodayCount,
    providerCount,
    manualChapterCount: MANUAL_CHAPTERS.length,
  };
  return <DashboardView stats={stats} />;
}
