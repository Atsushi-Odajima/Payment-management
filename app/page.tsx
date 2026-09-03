import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { livemodeWhere, modeFromCookieStore } from "@/lib/mode";
import { prisma } from "@/lib/db";
import { DashboardView, type DashboardStats } from "@/components/views/dashboard-view";
import { currentAdminFromCookies } from "@/lib/admin/page-guard";
import { OPEN_STATUSES, SALES_STATUSES } from "@/lib/payments/transitions";
import { MANUAL_CHAPTERS } from "@/lib/manual/chapters";
import { startOfDayInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The entry screen asks for a login once; the session then covers every page. */
export default async function DashboardPage() {
  const admin = await currentAdminFromCookies();
  if (!admin) redirect("/login");

  const now = new Date();
  const today = startOfDayInTz(now);
  const modeWhere = livemodeWhere(modeFromCookieStore(cookies()));
  const [merchantCount, agentCount, todayAgg, openCount, overdueCount, activeIpRuleCount, adminCount, auditTodayCount, providerCount] =
    await Promise.all([
      prisma.merchant.count(),
      prisma.agent.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { ...modeWhere, status: { in: [...SALES_STATUSES] }, capturedAt: { gte: today } },
      }),
      prisma.payment.count({ where: { ...modeWhere, status: { in: [...OPEN_STATUSES] } } }),
      prisma.payment.count({ where: { ...modeWhere, status: "awaiting_transfer", transferDueAt: { lt: now } } }),
      prisma.ipRestriction.count({ where: { enabled: true } }),
      prisma.adminUser.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      prisma.paymentProvider.count({ where: { status: "active" } }),
    ]);

  const stats: DashboardStats = {
    merchantCount,
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
