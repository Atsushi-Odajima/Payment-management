import { PaymentLinkNewView } from "@/components/views/payment-link-new-view";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/page-guard";

export const dynamic = "force-dynamic";

export default async function PaymentLinkNewPage() {
  await requireAdminPage();
  const merchants = await prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } });
  return <PaymentLinkNewView merchants={merchants} />;
}
