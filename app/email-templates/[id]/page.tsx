import { notFound } from "next/navigation";
import { EmailTemplateEditView } from "@/components/views/email-template-edit-view";
import { loadEmailTemplate } from "@/lib/email/list";

export const dynamic = "force-dynamic";

export default async function EmailTemplateEditPage({ params }: { params: { id: string } }) {
  const template = await loadEmailTemplate(params.id);
  if (!template) notFound();
  return <EmailTemplateEditView template={template} />;
}
