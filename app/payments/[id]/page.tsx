import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PaymentDetailView } from "@/components/views/payment-detail-view";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: {
      provider: {
        select: {
          id: true,
          displayName: true,
          providerKey: true,
          testMode: true,
        },
      },
    },
  });
  if (!payment) notFound();

  return (
    <PaymentDetailView
      payment={{
        id: payment.id,
        orderNumber: payment.orderNumber,
        amount: payment.amount,
        status: payment.status,
        externalId: payment.externalId,
        customerName: payment.customerName,
        customerEmail: payment.customerEmail,
        description: payment.description,
        createdAt: payment.createdAt,
        capturedAt: payment.capturedAt,
        cancelledAt: payment.cancelledAt,
        refundedAt: payment.refundedAt,
        provider: payment.provider,
      }}
    />
  );
}
