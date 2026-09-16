import { redirect } from "next/navigation";
import { LoginView } from "@/components/views/login-view";
import { currentAdminFromCookies } from "@/lib/admin/page-guard";
import { prisma } from "@/lib/db";
import { DEMO_PUBLIC_OPERATOR } from "@/prisma/seed-accounts";
import { DEMO_PUBLIC_MERCHANT } from "@/prisma/seed-data";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentAdminFromCookies()) redirect("/");
  // The public demo lists exactly two accounts: the operations demo account
  // (role cs) and the merchant demo account (MER-00001). The admin and the
  // other seeded operators are never shown (their passwords are private in
  // production, see prisma/seed-accounts.ts).
  let demo: Parameters<typeof LoginView>[0]["demo"];
  if (process.env.DEMO_LOGIN_HINT) {
    const merchant = await prisma.merchant.findUnique({ where: { id: DEMO_PUBLIC_MERCHANT.id }, select: { merchantCode: true, siteName: true } });
    demo = {
      operator: { loginId: DEMO_PUBLIC_OPERATOR.loginId, password: DEMO_PUBLIC_OPERATOR.password },
      merchant: merchant ? { merchantCode: merchant.merchantCode, siteName: merchant.siteName, password: DEMO_PUBLIC_MERCHANT.password } : null,
    };
  }
  return <LoginView demo={demo} />;
}
