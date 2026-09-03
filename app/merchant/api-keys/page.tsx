import { MerchantApiKeysView } from "@/components/views/merchant/api-keys-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { loadMerchantApiKeys } from "@/lib/merchants/detail";

export const dynamic = "force-dynamic";

export default async function MerchantApiKeysPage() {
  const m = await requireMerchantPage();
  const keys = await loadMerchantApiKeys(m.id);
  return <MerchantApiKeysView keys={keys} />;
}
