import { prisma } from "@/lib/db";
import { NewPaymentView } from "@/components/views/new-payment-view";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage() {
  const [providers, merchants] = await Promise.all([
    prisma.paymentProvider.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      select: { id: true, displayName: true, providerKey: true, testMode: true },
    }),
    prisma.merchant.findMany({
      orderBy: { merchantCode: "asc" },
      select: { id: true, merchantCode: true, siteName: true },
    }),
  ]);

  return <NewPaymentView providers={providers} merchants={merchants} />;
}
