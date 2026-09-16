import { redirect } from "next/navigation";
import { MerchantLoginView } from "@/components/views/merchant/login-view";
import { currentMerchantFromCookies } from "@/lib/merchant-portal/page-guard";
import { DEMO_PUBLIC_MERCHANT } from "@/prisma/seed-data";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MerchantLoginPage() {
  if (await currentMerchantFromCookies()) redirect("/merchant");
  // Only the merchant demo account (MER-00001) is listed; the other seeded
  // merchants have private passwords on the public demo.
  let demo: Array<{ merchantCode: string; siteName: string; password: string }> | undefined;
  if (process.env.DEMO_LOGIN_HINT) {
    const row = await prisma.merchant.findUnique({ where: { id: DEMO_PUBLIC_MERCHANT.id }, select: { merchantCode: true, siteName: true } });
    demo = row ? [{ merchantCode: row.merchantCode, siteName: row.siteName, password: DEMO_PUBLIC_MERCHANT.password }] : [];
  }
  return <MerchantLoginView demo={demo} showAdminLink={Boolean(process.env.DEMO_LOGIN_HINT)} />;
}
