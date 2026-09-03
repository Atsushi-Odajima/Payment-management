import { GlobalSettingsView } from "@/components/views/global-settings-view";
import { prisma } from "@/lib/db";
import { requirePermissionPage } from "@/lib/admin/page-guard";
import { loadGlobalSettings } from "@/lib/settings/global";

export const dynamic = "force-dynamic";

export default async function GlobalSettingsPage() {
  await requirePermissionPage("global_setting", "view");
  const settings = await loadGlobalSettings(prisma);
  return <GlobalSettingsView settings={settings} />;
}
