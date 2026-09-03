"use client";

// Settings → global settings (admin only). Phase I adds the viewer CSV switch,
// Phase J the Slack webhook, Phase K the qualified-invoice issuer and the
// consumption-tax rounding; later phases add retention settings here.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { CSV_PII_MODES, type CsvPiiMode, type GlobalSettingsInput } from "@/lib/settings/global";
import { TAX_ROUNDINGS, type TaxRounding } from "@/lib/settlements/types";
import type { MessageKey } from "@/lib/i18n";

export function GlobalSettingsView({ settings }: { settings: GlobalSettingsInput }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const [viewerCsvExport, setViewerCsvExport] = useState(settings.viewerCsvExport);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(settings.slackWebhookUrl);
  const [issuerName, setIssuerName] = useState(settings.issuerName);
  const [issuerRegistrationNo, setIssuerRegistrationNo] = useState(settings.issuerRegistrationNo);
  const [issuerAddress, setIssuerAddress] = useState(settings.issuerAddress);
  const [issuerTel, setIssuerTel] = useState(settings.issuerTel);
  const [taxRounding, setTaxRounding] = useState<TaxRounding>(settings.taxRounding);
  const [piiRetentionMonths, setPiiRetentionMonths] = useState(String(settings.piiRetentionMonths));
  const [auditRetentionYears, setAuditRetentionYears] = useState(String(settings.auditRetentionYears));
  const [csvPii, setCsvPii] = useState<CsvPiiMode>(settings.csvPii);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    setFieldErrors({});
    const res = await apiJson("/api/global-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ viewerCsvExport, slackWebhookUrl, issuerName, issuerRegistrationNo, issuerAddress, issuerTel, taxRounding, piiRetentionMonths: Number(piiRetentionMonths), auditRetentionYears: Number(auditRetentionYears), csvPii }),
    });
    setBusy(false);
    if (!res.ok) {
      const fe = (res.error.details as { fieldErrors?: Record<string, string> } | undefined)?.fieldErrors;
      if (fe) setFieldErrors(fe);
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("globalSettings.saved"));
    router.refresh();
  }
  const err = (k: string) => (fieldErrors[k] ? (fieldErrors[k] === "registrationNo" ? t("settlementTab.errors.registrationNo") : t("globalSettings.fieldError", { field: k, code: fieldErrors[k] })) : null);

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
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-800">{t("globalSettings.sectionInvoice")}</legend>
          <p className="text-xs text-slate-500">{t("globalSettings.invoiceHelp")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="gs-issuer-name" label={t("globalSettings.issuerName")} error={err("issuerName")}>
              <input id="gs-issuer-name" className="input" value={issuerName} onChange={(e) => setIssuerName(e.target.value)} maxLength={120} />
            </FormField>
            <FormField id="gs-issuer-reg" label={t("globalSettings.issuerRegistrationNo")} help={t("globalSettings.issuerRegistrationNoHelp")} error={err("issuerRegistrationNo")}>
              <input id="gs-issuer-reg" className="input font-mono" value={issuerRegistrationNo} onChange={(e) => setIssuerRegistrationNo(e.target.value)} maxLength={14} placeholder="T1234567890123" />
            </FormField>
            <FormField id="gs-issuer-address" label={t("globalSettings.issuerAddress")} error={err("issuerAddress")}>
              <input id="gs-issuer-address" className="input" value={issuerAddress} onChange={(e) => setIssuerAddress(e.target.value)} maxLength={200} />
            </FormField>
            <FormField id="gs-issuer-tel" label={t("globalSettings.issuerTel")} error={err("issuerTel")}>
              <input id="gs-issuer-tel" className="input" value={issuerTel} onChange={(e) => setIssuerTel(e.target.value)} maxLength={30} />
            </FormField>
            <FormField id="gs-rounding" label={t("globalSettings.taxRounding")} help={t("globalSettings.taxRoundingHelp")}>
              <select id="gs-rounding" className="input" value={taxRounding} onChange={(e) => setTaxRounding(e.target.value as TaxRounding)}>
                {TAX_ROUNDINGS.map((r) => (
                  <option key={r} value={r}>
                    {t(`globalSettings.rounding.${r}` as MessageKey)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-800">{t("globalSettings.sectionPii")}</legend>
          <p className="text-xs text-slate-500">{t("globalSettings.piiHelp")}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="gs-pii-months" label={t("globalSettings.piiRetentionMonths")} help={t("globalSettings.piiRetentionMonthsHelp")} error={err("piiRetentionMonths")}>
              <input id="gs-pii-months" type="number" min={1} max={120} className="input" value={piiRetentionMonths} onChange={(e) => setPiiRetentionMonths(e.target.value)} required />
            </FormField>
            <FormField id="gs-audit-years" label={t("globalSettings.auditRetentionYears")} help={t("globalSettings.auditRetentionYearsHelp")} error={err("auditRetentionYears")}>
              <input id="gs-audit-years" type="number" min={1} max={30} className="input" value={auditRetentionYears} onChange={(e) => setAuditRetentionYears(e.target.value)} required />
            </FormField>
            <FormField id="gs-csv-pii" label={t("globalSettings.csvPii")} help={t("globalSettings.csvPiiHelp")}>
              <select id="gs-csv-pii" className="input" value={csvPii} onChange={(e) => setCsvPii(e.target.value as CsvPiiMode)}>
                {CSV_PII_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`globalSettings.csvPiiModes.${m}` as MessageKey)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
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
