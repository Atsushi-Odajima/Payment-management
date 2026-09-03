import { cookies } from "next/headers";
import { MerchantSettlementsView } from "@/components/views/merchant/settlements-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { modeFromCookieStore } from "@/lib/mode";
import { loadMerchantSettlements } from "@/lib/settlements/list";

export const dynamic = "force-dynamic";

export default async function MerchantSettlementsPage() {
  const m = await requireMerchantPage();
  const rows = await loadMerchantSettlements(m.id, modeFromCookieStore(cookies()), 100);
  return <MerchantSettlementsView rows={rows} />;
}
