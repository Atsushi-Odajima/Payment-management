import { EmailTemplatesView } from "@/components/views/email-templates-view";
import { loadEmailTemplates } from "@/lib/email/list";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  return <EmailTemplatesView templates={await loadEmailTemplates()} />;
}
