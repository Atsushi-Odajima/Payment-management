import { prisma } from "@/lib/db";
import { MerchantsView } from "@/components/views/merchants-view";
import { isEmailNotification } from "@/lib/merchants/types";

export const dynamic = "force-dynamic";

export default async function MerchantsPage() {
  // Never select passwordEnc here.
  const merchants = await prisma.merchant.findMany({
    orderBy: { merchantCode: "asc" },
    select: {
      id: true,
      merchantCode: true,
      siteName: true,
      companyName: true,
      contactName: true,
      emailNotification: true,
      createdAt: true,
    },
  });

  return (
    <MerchantsView
      merchants={merchants.map((m) => ({
        ...m,
        emailNotification: isEmailNotification(m.emailNotification) ? m.emailNotification : "none",
      }))}
    />
  );
}
