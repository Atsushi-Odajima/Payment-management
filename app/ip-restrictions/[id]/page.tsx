import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { IpRestrictionEditView } from "@/components/views/ip-restriction-edit-view";
import { isIpTarget } from "@/lib/ip-restrictions/types";

export const dynamic = "force-dynamic";

export default async function EditIpRestrictionPage({ params }: { params: { id: string } }) {
  const [rule, merchants] = await Promise.all([
    prisma.ipRestriction.findUnique({
      where: { id: params.id },
      select: { id: true, target: true, merchantId: true, cidr: true, label: true, enabled: true },
    }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
  ]);
  if (!rule) notFound();
  return (
    <IpRestrictionEditView
      mode="edit"
      ruleId={rule.id}
      initial={{
        target: isIpTarget(rule.target) ? rule.target : "admin",
        merchantId: rule.merchantId,
        cidr: rule.cidr,
        label: rule.label,
        enabled: rule.enabled,
      }}
      merchants={merchants}
    />
  );
}
