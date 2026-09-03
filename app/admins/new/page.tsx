import { AdminNewView } from "@/components/views/admin-new-view";
import { requireMasterPage } from "@/lib/admin/page-guard";

export const dynamic = "force-dynamic";

export default async function NewAdminPage() {
  await requireMasterPage();
  return <AdminNewView />;
}
