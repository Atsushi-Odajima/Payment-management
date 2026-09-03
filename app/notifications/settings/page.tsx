import { NotificationSettingsView } from "@/components/views/notification-settings-view";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { loadPreferences } from "@/lib/notifications/list";
import { loadGlobalSettings } from "@/lib/settings/global";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const admin = await requireAdminPage();
  const [preferences, settings] = await Promise.all([loadPreferences(prisma, admin.id), loadGlobalSettings(prisma)]);
  return <NotificationSettingsView preferences={preferences} slackConfigured={!!settings.slackWebhookUrl} />;
}
