import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/providers/registry";
import {
  DashboardView,
  type DashboardPaymentItem,
} from "@/components/views/dashboard-view";
import type { CategoryKey } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [providers, payments, capturedAggregate, todayAggregate] =
    await Promise.all([
      prisma.paymentProvider.findMany({
        orderBy: { createdAt: "desc" },
        select: { status: true, category: true },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { provider: { select: { providerKey: true } } },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { status: "captured" },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: {
          status: "captured",
          capturedAt: { gte: startOfToday() },
        },
      }),
    ]);

  const categoryCounts = Object.fromEntries(
    CATEGORIES.map((c) => [
      c.key,
      providers.filter((p) => p.category === c.key).length,
    ]),
  ) as Record<CategoryKey, number>;

  const paymentItems: DashboardPaymentItem[] = payments.map((p) => ({
    id: p.id,
    orderNumber: p.orderNumber,
    providerKey: p.provider.providerKey,
    amount: p.amount,
    status: p.status,
    createdAt: p.createdAt,
  }));

  return (
    <DashboardView
      providerCount={providers.length}
      activeProviderCount={providers.filter((p) => p.status === "active").length}
      totalSalesAmount={capturedAggregate._sum.amount ?? 0}
      totalSalesCount={capturedAggregate._count}
      todaySalesAmount={todayAggregate._sum.amount ?? 0}
      todaySalesCount={todayAggregate._count}
      categoryCounts={categoryCounts}
      payments={paymentItems}
    />
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
