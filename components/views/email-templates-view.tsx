"use client";

// Email template list (Phase G-2): one row per key × language.

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { EmailTemplateRow } from "@/lib/email/list";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function EmailTemplatesView({ templates }: { templates: EmailTemplateRow[] }) {
  const t = useT();
  const formatDate = useFormatDateTime();
  return (
    <div>
      <PageHeader title={t("emailTemplates.title")} description={t("emailTemplates.description")} helpHref="/manual/emails" />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">{t("emailTemplates.thKey")}</th>
                <th className="px-5 py-3">{t("emailTemplates.thLang")}</th>
                <th className="px-5 py-3">{t("emailTemplates.thSubject")}</th>
                <th className="px-5 py-3">{t("emailTemplates.thEnabled")}</th>
                <th className="px-5 py-3">{t("emailTemplates.thUpdated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/email-templates/${tpl.id}`} className="font-medium text-brand-700 hover:underline">
                      {t(`emailEnums.key.${tpl.key}` as MessageKey)}
                    </Link>
                    <span className="ml-2 font-mono text-[11px] text-slate-500">{tpl.key}</span>
                  </td>
                  <td className="px-5 py-3 uppercase text-slate-600">{tpl.lang}</td>
                  <td className="px-5 py-3 text-slate-800">{tpl.subject}</td>
                  <td className="px-5 py-3">
                    <span className={cn("badge", tpl.enabled ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200")}>{tpl.enabled ? t("common.enabled") : t("common.disabled")}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600">{formatDate(tpl.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
