import { prisma } from "@/lib/db";
import { DashboardView } from "@/components/views/dashboard-view";
import { OPEN_STATUSES, SALES_STATUSES } from "@/lib/payments/transitions";
import { startOfDayInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const [merchantCount, agentCount, today, openCount, overdueCount, activeIpRuleCount] = await Promise.all([
    prisma.merchant.count(),
    prisma.agent.count(),
    prisma.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { status: { in: [...SALES_STATUSES] }, capturedAt: { gte: startOfDayInTz(now) } },
    }),
    prisma.payment.count({ where: { status: { in: [...OPEN_STATUSES] } } }),
    prisma.payment.count({ where: { status: "awaiting_transfer", transferDueAt: { lt: now } } }),
    prisma.ipRestriction.count({ where: { enabled: true } }),
  ]);

  return (
    <DashboardView
      merchantCount={merchantCount}
      agentCount={agentCount}
      todayPaymentCount={today._count}
      todayPaymentAmount={today._sum.amount ?? 0}
      openTransactionCount={openCount}
      overdueTransferCount={overdueCount}
      activeIpRuleCount={activeIpRuleCount}
    />
  );
}
