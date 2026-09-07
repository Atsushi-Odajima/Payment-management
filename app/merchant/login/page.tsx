import { redirect } from "next/navigation";
import { MerchantLoginView } from "@/components/views/merchant/login-view";
import { currentMerchantFromCookies } from "@/lib/merchant-portal/page-guard";
import { SEED_MERCHANT_PASSWORDS } from "@/prisma/seed-data";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MerchantLoginPage() {
  if (await currentMerchantFromCookies()) redirect("/merchant");
  let demo: Array<{ merchantCode: string; siteName: string; password: string }> | undefined;
  if (process.env.DEMO_LOGIN_HINT) {
    const rows = await prisma.merchant.findMany({ where: { id: { in: Object.keys(SEED_MERCHANT_PASSWORDS) } }, select: { id: true, merchantCode: true, siteName: true }, orderBy: { merchantCode: "asc" } });
    demo = rows.map((r) => ({ merchantCode: r.merchantCode, siteName: r.siteName, password: SEED_MERCHANT_PASSWORDS[r.id as keyof typeof SEED_MERCHANT_PASSWORDS] }));
  }
  return <MerchantLoginView demo={demo} showAdminLink={Boolean(process.env.DEMO_LOGIN_HINT)} />;
}
