import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PaymentDetailView } from "@/components/views/payment-detail-view";
import { toPaymentStatus } from "@/lib/payments/transitions";
import { storedFieldKeys } from "@/lib/providers/credentials";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      orderNumber: true,
      amount: true,
      amountRefunded: true,
      status: true,
      livemode: true,
      externalId: true,
      customerName: true,
      customerEmail: true,
      description: true,
      createdAt: true,
      provider: {
        select: { id: true, displayName: true, providerKey: true, credentials: true },
      },
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          fromStatus: true,
          toStatus: true,
          amount: true,
          actor: true,
          createdAt: true,
        },
      },
      refunds: {
        orderBy: { createdAt: "desc" },
        select: { id: true, amount: true, reason: true, createdAt: true },
      },
    },
  });
  if (!payment) notFound();

  // Only a presence check crosses to the client — never the credential store.
  const webhookAvailable = storedFieldKeys(payment.provider.credentials).includes("webhook_secret");

  return (
    <PaymentDetailView
      payment={{
        id: payment.id,
        orderNumber: payment.orderNumber,
        amount: payment.amount,
        amountRefunded: payment.amountRefunded,
        status: toPaymentStatus(payment.status),
        livemode: payment.livemode,
        externalId: payment.externalId,
        customerName: payment.customerName,
        customerEmail: payment.customerEmail,
        description: payment.description,
        createdAt: payment.createdAt,
        provider: {
          id: payment.provider.id,
          displayName: payment.provider.displayName,
          providerKey: payment.provider.providerKey,
          webhookAvailable,
        },
        events: payment.events,
        refunds: payment.refunds,
      }}
    />
  );
}
