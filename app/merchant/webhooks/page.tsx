import { cookies } from "next/headers";
import { MerchantWebhooksView } from "@/components/views/merchant/webhooks-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { modeFromCookieStore } from "@/lib/mode";
import { loadMerchantWebhooks } from "@/lib/webhooks/list";

export const dynamic = "force-dynamic";

export default async function MerchantWebhooksPage() {
  const m = await requireMerchantPage();
  const rows = await loadMerchantWebhooks(m.id, modeFromCookieStore(cookies()), 100);
  return <MerchantWebhooksView rows={rows} />;
}
