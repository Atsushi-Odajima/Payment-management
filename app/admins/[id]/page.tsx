import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminDetailView } from "@/components/views/admin-detail-view";
import { requireMasterPage } from "@/lib/admin/page-guard";
import { ADMIN_SELECT, toAdminView } from "@/lib/admin/select";

export const dynamic = "force-dynamic";

export default async function AdminDetailPage({ params }: { params: { id: string } }) {
  await requireMasterPage();
  const row = await prisma.adminUser.findUnique({ where: { id: params.id }, select: ADMIN_SELECT });
  if (!row) notFound();
  return <AdminDetailView admin={toAdminView(row)} />;
}
