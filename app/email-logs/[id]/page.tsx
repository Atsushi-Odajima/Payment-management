import { maskEmail } from "@/lib/pii/mask";
import { notFound } from "next/navigation";
import { EmailLogDetailView } from "@/components/views/email-log-detail-view";
import { loadEmailLog } from "@/lib/email/list";

export const dynamic = "force-dynamic";

export default async function EmailLogDetailPage({ params }: { params: { id: string } }) {
  const log = await loadEmailLog(params.id);
  if (!log) notFound();
  return <EmailLogDetailView log={{ ...log, to: maskEmail(log.to) ?? "" }} />;
}
