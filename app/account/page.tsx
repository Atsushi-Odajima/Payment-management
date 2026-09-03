import { prisma } from "@/lib/db";
import { AccountView } from "@/components/views/account-view";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { ADMIN_SELECT, toAdminView } from "@/lib/admin/select";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const admin = await requireAdminPage();
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: ADMIN_SELECT });
  return <AccountView admin={toAdminView(row)} />;
}
