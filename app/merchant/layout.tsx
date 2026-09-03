import { MerchantShell } from "@/components/merchant-shell";
import { currentMerchantFromCookies } from "@/lib/merchant-portal/page-guard";

export const dynamic = "force-dynamic";

/**
 * Merchant portal layout (Phase L-2): resolves the merchant behind the portal
 * cookie (never the operator session) and renders the portal chrome. Pages
 * that need a merchant call requireMerchantPage() themselves.
 */
export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const m = await currentMerchantFromCookies();
  return <MerchantShell merchant={m ? { id: m.id, merchantCode: m.merchantCode, siteName: m.siteName } : null}>{children}</MerchantShell>;
}
