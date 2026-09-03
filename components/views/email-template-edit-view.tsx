"use client";

// Email template editor: subject / body with the placeholder list and a live
// preview rendered with sample values (master saves).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useT } from "@/components/language-provider";
import { useCan } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { EmailTemplateRow } from "@/lib/email/list";
import { EMAIL_PLACEHOLDERS, SAMPLE_EMAIL_VARS, placeholdersIn, renderTemplate } from "@/lib/email/templates";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function EmailTemplateEditView({ template }: { template: EmailTemplateRow }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const isMaster = useCan("email_template", "update");
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = new Set([...placeholdersIn(subject), ...placeholdersIn(body)]);
  const unknown = [...used].filter((u) => !(EMAIL_PLACEHOLDERS as readonly string[]).includes(u));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson(`/api/email-templates/${template.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, body, enabled }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("emailTemplates.saved"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={t(`emailEnums.key.${template.key}` as MessageKey)}
        description={`${template.key} · ${template.lang.toUpperCase()}`}
        helpHref="/manual/emails"
        breadcrumbs={[{ label: t("emailTemplates.title"), href: "/email-templates" }, { label: template.key }]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <form onSubmit={save} className="card space-y-4 p-5" aria-busy={busy}>
          <FormField id="tpl-subject" label={t("emailTemplates.subject")} required>
            <input id="tpl-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
          </FormField>
          <FormField id="tpl-body" label={t("emailTemplates.body")} required>
            <textarea id="tpl-body" className="input min-h-[280px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t("emailTemplates.enabled")}
          </label>
          <div>
            <p className="text-xs font-medium text-slate-600">{t("emailTemplates.placeholders")}</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {EMAIL_PLACEHOLDERS.map((p) => (
                <li key={p}>
                  <button type="button" className={cn("rounded border px-2 py-0.5 font-mono text-[11px]", used.has(p) ? "border-brand-300 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")} onClick={() => setBody((b) => `${b}{{${p}}}`)} title={t(`emailEnums.placeholder.${p}` as MessageKey)}>
                    {`{{${p}}}`}
                  </button>
                </li>
              ))}
            </ul>
            {unknown.length > 0 && <p className="mt-1 text-xs text-rose-700">{t("emailTemplates.unknownPlaceholders", { list: unknown.join(", ") })}</p>}
          </div>
          {!isMaster && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("emailTemplates.masterOnly")}</p>}
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <Link href="/email-templates" className="text-xs text-brand-700 hover:underline">
              {t("emailTemplates.back")}
            </Link>
            <button type="submit" className="btn-primary" disabled={busy || !isMaster}>
              {busy ? t("common.processing") : t("emailTemplates.save")}
            </button>
          </div>
        </form>
        <section className="card p-5" aria-labelledby="tpl-preview">
          <h2 id="tpl-preview" className="text-sm font-semibold text-slate-800">
            {t("emailTemplates.preview")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("emailTemplates.previewHelp")}</p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-xs text-slate-500">{t("emailTemplates.subject")}</p>
            <p className="font-medium text-slate-900">{renderTemplate(subject, SAMPLE_EMAIL_VARS)}</p>
            <p className="mt-3 text-xs text-slate-500">{t("emailTemplates.body")}</p>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{renderTemplate(body, SAMPLE_EMAIL_VARS)}</pre>
          </div>
        </section>
      </div>
    </div>
  );
}
