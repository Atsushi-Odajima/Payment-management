import { notFound } from "next/navigation";
import { PayPageView } from "@/components/views/pay-page-view";
import { prisma } from "@/lib/db";
import { loadPublicLink } from "@/lib/payment-links/list";
import { checkoutMethods } from "@/lib/payment-links/service";

export const dynamic = "force-dynamic";

/** Hosted checkout page for a payment link. Public: no session, no admin chrome (AppShell strips it for /pay/*). */
export default async function PayPage({ params }: { params: { token: string } }) {
  const link = await loadPublicLink(params.token);
  if (!link) notFound();
  const raw = await prisma.paymentLink.findUnique({ where: { token: params.token }, select: { livemode: true, merchant: { select: { enabledMethods: true } } } });
  const methods = raw && !link.unavailable ? (await checkoutMethods(prisma, raw)).map((m) => m.method) : [];
  return (
    <PayPageView
      link={{
        token: link.token,
        productName: link.productName,
        amount: link.amount,
        description: link.description,
        merchant: link.merchant.siteName,
        unavailable: link.unavailable,
        methods,
        livemode: link.livemode,
      }}
    />
  );
}
