import { prisma } from "@/lib/db";
import { MerchantMethodsView } from "@/components/views/merchant/methods-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { parseEnabledMethods } from "@/lib/merchants/types";
import { loadMerchantControls } from "@/lib/payments/method-controls";

export const dynamic = "force-dynamic";

export default async function MerchantMethodsPage() {
  const m = await requireMerchantPage();
  const controls = await loadMerchantControls(prisma, m.id);
  return <MerchantMethodsView enabled={parseEnabledMethods(m.enabledMethods)} global={controls.global} merchant={controls.merchant} />;
}
