import { prisma } from "@/lib/db";
import { DashboardView } from "@/components/views/dashboard-view";
import { startOfDayInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

const SALES_STATUSES = ["captured", "partially_refunded", "refunded"];

export default async function DashboardPage() {
  const [merchantCount, agentCount, today, pendingApplicationCount, activeIpRuleCount] =
    await Promise.all([
      prisma.merchant.count(),
      prisma.agent.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { status: { in: SALES_STATUSES }, capturedAt: { gte: startOfDayInTz(new Date()) } },
      }),
      prisma.paymentApplication.count({ where: { status: "pending" } }),
      prisma.ipRestriction.count({ where: { enabled: true } }),
    ]);

  return (
    <DashboardView
      merchantCount={merchantCount}
      agentCount={agentCount}
      todayPaymentCount={today._count}
      todayPaymentAmount={today._sum.amount ?? 0}
      pendingApplicationCount={pendingApplicationCount}
      activeIpRuleCount={activeIpRuleCount}
    />
  );
}
