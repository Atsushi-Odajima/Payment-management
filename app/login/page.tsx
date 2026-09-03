import { redirect } from "next/navigation";
import { LoginView } from "@/components/views/login-view";
import { currentAdminFromCookies } from "@/lib/admin/page-guard";
import { DEMO_ADMIN_ACCOUNTS } from "@/prisma/seed-accounts";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentAdminFromCookies()) redirect("/");
  // The seeded demo credentials are shown on the public demo only.
  const demo = process.env.DEMO_LOGIN_HINT
    ? {
        accounts: Object.values(DEMO_ADMIN_ACCOUNTS).map((a) => ({ role: a.role, loginId: a.loginId, password: a.password })),
      }
    : undefined;
  return <LoginView demo={demo} />;
}
