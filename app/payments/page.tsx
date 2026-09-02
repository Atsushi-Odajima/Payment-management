import { prisma } from "@/lib/db";
import { PaymentsView, type PaymentListItem } from "@/components/views/payments-view";
import { isPaymentStatus, toPaymentStatus } from "@/lib/payments/transitions";
import { toModeFilter } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SALES_STATUSES = ["captured", "partially_refunded", "refunded"];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: { status?: string; mode?: string };
}) {
  const status = isPaymentStatus(searchParams?.status) ? searchParams!.status! : "all";
  const mode = toModeFilter(searchParams?.mode);
  const modeWhere = mode === "all" ? {} : { livemode: mode === "live" };
  const where = { ...modeWhere, ...(status !== "all" ? { status } : {}) };

  const [payments, aggregate] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        externalId: true,
        customerName: true,
        customerEmail: true,
        amount: true,
        amountRefunded: true,
        status: true,
        livemode: true,
        createdAt: true,
        provider: { select: { providerKey: true, displayName: true } },
      },
    }),
    // Realized sales for the current mode (independent of the status filter).
    prisma.payment.aggregate({
      where: { ...modeWhere, status: { in: SALES_STATUSES } },
      _sum: { amount: true, amountRefunded: true },
      _count: true,
    }),
  ]);

  const items: PaymentListItem[] = payments.map((p) => ({
    id: p.id,
    orderNumber: p.orderNumber,
    externalId: p.externalId,
    providerKey: p.provider.providerKey,
    providerDisplayName: p.provider.displayName,
    customerName: p.customerName,
    customerEmail: p.customerEmail,
    amount: p.amount,
    amountRefunded: p.amountRefunded,
    status: toPaymentStatus(p.status),
    livemode: p.livemode,
    createdAt: p.createdAt,
  }));

  return (
    <PaymentsView
      status={status === "all" ? "all" : toPaymentStatus(status)}
      mode={mode}
      payments={items}
      capturedAmount={(aggregate._sum.amount ?? 0) - (aggregate._sum.amountRefunded ?? 0)}
      capturedCount={aggregate._count}
    />
  );
}
