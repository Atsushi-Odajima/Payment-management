import { maskCustomerFields } from "@/lib/pii/mask";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { livemodeWhere, modeFromCookieStore } from "@/lib/mode";
import { TransactionsView } from "@/components/views/transactions-view";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadTransactions, parseTransactionFilters } from "@/lib/payments/list";
import { SALES_STATUSES } from "@/lib/payments/transitions";
import { startOfDayInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 決済一覧 — completed sales (captured / partially refunded / refunded). */
export default async function PaymentsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const page = parsePage(searchParams?.page);
  const filters = parseTransactionFilters(searchParams, SALES_STATUSES, modeFromCookieStore(cookies()));
  const modeWhere = livemodeWhere(filters.mode);

  const [result, salesAggregate, todayAggregate] = await Promise.all([
    loadTransactions({ allowedStatuses: SALES_STATUSES, filters, page, pageSize: DEFAULT_PAGE_SIZE, order: "sales" }),
    // Realized sales for the current mode (independent of the other filters).
    prisma.payment.aggregate({
      where: { ...modeWhere, status: { in: [...SALES_STATUSES] } },
      _sum: { amount: true, amountRefunded: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { ...modeWhere, status: { in: [...SALES_STATUSES] }, capturedAt: { gte: startOfDayInTz(new Date()) } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return (
    <TransactionsView
      kind="sales"
      items={result.items.map((i) => maskCustomerFields(i, "masked"))}
      total={result.total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      filters={result.filters}
      merchants={result.merchants}
      statuses={SALES_STATUSES}
      stats={{
        grossSales: salesAggregate._sum.amount ?? 0,
        refundsTotal: salesAggregate._sum.amountRefunded ?? 0,
        salesCount: salesAggregate._count,
        todaySalesAmount: todayAggregate._sum.amount ?? 0,
        todaySalesCount: todayAggregate._count,
      }}
    />
  );
}
