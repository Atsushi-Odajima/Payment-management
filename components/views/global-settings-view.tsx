"use client";

// Settings → global settings (admin only). Phase I adds the viewer CSV switch;
// later phases add Slack, invoice issuer and retention settings here.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useApiJson, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import type { GlobalSettingsInput } from "@/lib/settings/global";

export function GlobalSettingsView({ settings }: { settings: GlobalSettingsInput }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const [viewerCsvExport, setViewerCsvExport] = useState(settings.viewerCsvExport);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(settings.slackWebhookUrl);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function testSlack() {
    setTesting(true);
    const res = await apiJson<{ status: string; error: string | null }>("/api/global-settings/slack-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: slackWebhookUrl }) });
    setTesting(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(res.data.status === "failed" ? t("globalSettings.slackTestFailed", { error: res.data.error ?? "" }) : t("globalSettings.slackTestOk", { status: res.data.status }), res.data.status === "failed" ? "error" : undefined);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await apiJson("/api/global-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewerCsvExport, slackWebhookUrl }) });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("globalSettings.saved"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t("globalSettings.title")} description={t("globalSettings.description")} helpHref="/manual/roles" />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6" aria-busy={busy}>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">{t("globalSettings.sectionExport")}</legend>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={viewerCsvExport} onChange={(e) => setViewerCsvExport(e.target.checked)} />
            <span>
              {t("globalSettings.viewerCsvExport")}
              <span className="block text-xs text-slate-500">{t("globalSettings.viewerCsvExportHelp")}</span>
            </span>
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">{t("globalSettings.sectionSlack")}</legend>
          <label htmlFor="gs-slack" className="label">
            {t("globalSettings.slackWebhookUrl")}
          </label>
          <div className="flex gap-2">
            <input id="gs-slack" className="input font-mono text-xs" value={slackWebhookUrl} onChange={(e) => setSlackWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." maxLength={500} />
            <button type="button" className="btn-secondary whitespace-nowrap" disabled={testing || !slackWebhookUrl} onClick={testSlack}>
              {testing ? t("common.processing") : t("globalSettings.slackTest")}
            </button>
          </div>
          <p className="text-xs text-slate-500">{slackWebhookUrl ? t("globalSettings.slackHelp") : t("globalSettings.slackMissing")}</p>
        </fieldset>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("common.processing") : t("globalSettings.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
