"use client";

// Per-admin notification channels (Phase J): for every kind, in-app is always
// on; e-mail and Slack are opt-in. Slack needs the Incoming Webhook URL from
// Global settings (admin) — the column is disabled with a hint until then.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge } from "@/components/notification-bell";
import { useApiJson, useT } from "@/components/language-provider";
import { useCan } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { NOTIFICATION_DEFAULT_SEVERITY, type PreferenceRow } from "@/lib/notifications/types";
import type { MessageKey } from "@/lib/i18n";

export function NotificationSettingsView({ preferences, slackConfigured }: { preferences: PreferenceRow[]; slackConfigured: boolean }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const canGlobal = useCan("global_setting", "update");
  const [prefs, setPrefs] = useState(preferences);
  const [busy, setBusy] = useState(false);

  const set = (kind: PreferenceRow["kind"], field: "email" | "slack", value: boolean) => setPrefs((p) => p.map((x) => (x.kind === kind ? { ...x, [field]: value } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await apiJson("/api/notifications/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences: prefs }) });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("notifications.settingsSaved"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t("notifications.settingsTitle")} description={t("notifications.settingsDescription")} helpHref="/manual/notifications" breadcrumbs={[{ label: t("notifications.title"), href: "/notifications" }, { label: t("notifications.settingsTitle") }]} />
      {!slackConfigured && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("notifications.slackNotConfigured")}{" "}
          {canGlobal && (
            <Link href="/global-settings" className="font-medium underline">
              {t("notifications.slackConfigureLink")}
            </Link>
          )}
        </p>
      )}
      <form onSubmit={submit} className="card overflow-hidden" aria-busy={busy}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">{t("notifications.thKind")}</th>
                <th scope="col" className="px-5 py-3">{t("notifications.thSeverity")}</th>
                <th scope="col" className="px-5 py-3 text-center">{t("notifications.channelInApp")}</th>
                <th scope="col" className="px-5 py-3 text-center">{t("notifications.channelEmail")}</th>
                <th scope="col" className="px-5 py-3 text-center">{t("notifications.channelSlack")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prefs.map((p) => (
                <tr key={p.kind}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-900">{t(`notificationEnums.kind.${p.kind.replace(".", "_")}` as MessageKey)}</span>
                    <span className="block text-xs text-slate-500">{t(`notificationEnums.kindHelp.${p.kind.replace(".", "_")}` as MessageKey)}</span>
                  </td>
                  <td className="px-5 py-3">
                    <SeverityBadge severity={NOTIFICATION_DEFAULT_SEVERITY[p.kind]} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input type="checkbox" checked disabled aria-label={t("notifications.channelInApp")} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input type="checkbox" checked={p.email} onChange={(e) => set(p.kind, "email", e.target.checked)} aria-label={`${t("notifications.channelEmail")}: ${t(`notificationEnums.kind.${p.kind.replace(".", "_")}` as MessageKey)}`} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input type="checkbox" checked={p.slack} disabled={!slackConfigured} onChange={(e) => set(p.kind, "slack", e.target.checked)} aria-label={`${t("notifications.channelSlack")}: ${t(`notificationEnums.kind.${p.kind.replace(".", "_")}` as MessageKey)}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">{t("notifications.settingsNote")}</p>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("common.processing") : t("notifications.settingsSave")}
          </button>
        </div>
      </form>
    </div>
  );
}
