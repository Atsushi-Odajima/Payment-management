import { prisma } from "@/lib/db";
import {
  PaymentsView,
  type PaymentListItem,
} from "@/components/views/payments-view";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const status = searchParams?.status ?? "all";
  const where = status !== "all" ? { status } : {};

  const [payments, aggregate] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        provider: { select: { providerKey: true, displayName: true } },
      },
    }),
    prisma.payment.aggregate({
      where: { ...where, status: "captured" },
      _sum: { amount: true },
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
    status: p.status,
    createdAt: p.createdAt,
  }));

  return (
    <PaymentsView
      status={status}
      payments={items}
      capturedAmount={aggregate._sum.amount ?? 0}
      capturedCount={aggregate._count}
    />
  );
}
