import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MerchantDetailView } from "@/components/views/merchant-detail-view";
import { MERCHANT_SELECT } from "@/app/api/merchants/select";
import {
  isEmailNotification,
  isNotifyFormat,
  isNotifyIdFormat,
  isNotifyParamSet,
  type MerchantView,
} from "@/lib/merchants/types";

export const dynamic = "force-dynamic";

export default async function MerchantDetailPage({ params }: { params: { id: string } }) {
  // MERCHANT_SELECT excludes passwordEnc; the password is only reachable via
  // the role-gated API route.
  const m = await prisma.merchant.findUnique({ where: { id: params.id }, select: MERCHANT_SELECT });
  if (!m) notFound();

  const merchant: MerchantView = {
    ...m,
    notifyFormat: isNotifyFormat(m.notifyFormat) ? m.notifyFormat : "json_post",
    notifyParamSet: isNotifyParamSet(m.notifyParamSet) ? m.notifyParamSet : "standard",
    notifyIdFormat: isNotifyIdFormat(m.notifyIdFormat) ? m.notifyIdFormat : "payment_id",
    emailNotification: isEmailNotification(m.emailNotification) ? m.emailNotification : "none",
  };

  return <MerchantDetailView merchant={merchant} />;
}
