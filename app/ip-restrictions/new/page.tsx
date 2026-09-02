import { prisma } from "@/lib/db";
import { IpRestrictionEditView } from "@/components/views/ip-restriction-edit-view";

export const dynamic = "force-dynamic";

export default async function NewIpRestrictionPage() {
  const merchants = await prisma.merchant.findMany({
    orderBy: { merchantCode: "asc" },
    select: { id: true, merchantCode: true, siteName: true },
  });
  return <IpRestrictionEditView mode="create" merchants={merchants} />;
}
