import { notFound } from "next/navigation";
import { AuditLogDetailView } from "@/components/views/audit-log-detail-view";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { loadAuditLog } from "@/lib/audit-list";

export const dynamic = "force-dynamic";

export default async function AuditLogDetailPage({ params }: { params: { id: string } }) {
  await requireAdminPage();
  const log = await loadAuditLog(params.id);
  if (!log) notFound();
  return <AuditLogDetailView log={log} />;
}
