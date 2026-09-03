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
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await apiJson("/api/global-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewerCsvExport }) });
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
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("common.processing") : t("globalSettings.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
