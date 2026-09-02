import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/providers/registry";
import { DashboardView, type DashboardPaymentItem } from "@/components/views/dashboard-view";
import { toPaymentStatus } from "@/lib/payments/transitions";
import { toModeFilter } from "@/lib/utils";
import { startOfDayInTz } from "@/lib/time";
import type { CategoryKey } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

// Statuses that count as realized sales (gross); refunds are netted separately.
const SALES_STATUSES = ["captured", "partially_refunded", "refunded"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { mode?: string };
}) {
  const mode = toModeFilter(searchParams?.mode);
  const modeWhere = mode === "all" ? {} : { livemode: mode === "live" };

  const [providers, payments, salesAggregate, todayAggregate] = await Promise.all([
    prisma.paymentProvider.findMany({
      orderBy: { createdAt: "desc" },
      select: { status: true, category: true },
    }),
    prisma.payment.findMany({
      where: modeWhere,
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        amount: true,
        status: true,
        livemode: true,
        createdAt: true,
        provider: { select: { providerKey: true } },
      },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true, amountRefunded: true },
      _count: true,
      where: { ...modeWhere, status: { in: SALES_STATUSES } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: {
        ...modeWhere,
        status: { in: SALES_STATUSES },
        // "Today" in the merchant's time zone (Asia/Tokyo), not the server's.
        capturedAt: { gte: startOfDayInTz(new Date()) },
      },
    }),
  ]);

  const categoryCounts = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, providers.filter((p) => p.category === c.key).length]),
  ) as Record<CategoryKey, number>;

  const paymentItems: DashboardPaymentItem[] = payments.map((p) => ({
    id: p.id,
    orderNumber: p.orderNumber,
    providerKey: p.provider.providerKey,
    amount: p.amount,
    status: toPaymentStatus(p.status),
    livemode: p.livemode,
    createdAt: p.createdAt,
  }));

  return (
    <DashboardView
      mode={mode}
      providerCount={providers.length}
      activeProviderCount={providers.filter((p) => p.status === "active").length}
      grossSales={salesAggregate._sum.amount ?? 0}
      refundsTotal={salesAggregate._sum.amountRefunded ?? 0}
      salesCount={salesAggregate._count}
      todaySalesAmount={todayAggregate._sum.amount ?? 0}
      todaySalesCount={todayAggregate._count}
      categoryCounts={categoryCounts}
      payments={paymentItems}
    />
  );
}
