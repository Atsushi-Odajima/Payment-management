"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { useFormatDateTime, useT } from "@/components/language-provider";
import { EmailStatusBadge } from "@/components/views/email-logs-view";
import type { EmailLogDetail } from "@/lib/email/list";
import type { MessageKey } from "@/lib/i18n";

export function EmailLogDetailView({ log }: { log: EmailLogDetail }) {
  const t = useT();
  const formatDate = useFormatDateTime();
  return (
    <div>
      <PageHeader title={log.subject} description={t(`emailEnums.key.${log.templateKey}` as MessageKey)} helpHref="/manual/emails" breadcrumbs={[{ label: t("emailLogs.title"), href: "/email-logs" }, { label: log.id }]} actions={<EmailStatusBadge status={log.status} />} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="card divide-y divide-slate-100" aria-labelledby="mail-meta">
          <h2 id="mail-meta" className="px-5 py-3 text-sm font-semibold text-slate-800">
            {t("emailLogs.sectionMeta")}
          </h2>
          <DetailRow label={t("emailLogs.thTo")}>
            <span className="font-mono text-xs">{log.to}</span>
          </DetailRow>
          <DetailRow label={t("emailLogs.thTemplate")}>{t(`emailEnums.key.${log.templateKey}` as MessageKey)}</DetailRow>
          <DetailRow label={t("emailLogs.thLang")}>
            <span className="uppercase">{log.lang}</span>
          </DetailRow>
          <DetailRow label={t("emailLogs.thStatus")}>
            <EmailStatusBadge status={log.status} />
          </DetailRow>
          <DetailRow label={t("emailLogs.provider")}>{log.provider}</DetailRow>
          {log.error && (
            <DetailRow label={t("emailLogs.error")}>
              <span className="text-rose-700">{log.error}</span>
            </DetailRow>
          )}
          <DetailRow label={t("emailLogs.payment")}>
            {log.paymentId ? (
              <Link href={`/payments/${log.paymentId}`} className="font-mono text-xs text-brand-700 hover:underline">
                {log.paymentId}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label={t("emailLogs.thAt")}>{formatDate(log.createdAt)}</DetailRow>
        </section>
        <section className="card p-5" aria-labelledby="mail-body">
          <h2 id="mail-body" className="text-sm font-semibold text-slate-800">
            {t("emailLogs.sectionBody")}
          </h2>
          <p className="mt-3 text-xs text-slate-500">{t("emailTemplates.subject")}</p>
          <p className="font-medium text-slate-900">{log.subject}</p>
          <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-sm text-slate-800">{log.body}</pre>
          <p className="mt-3 text-xs text-slate-500">{t("emailLogs.demoNote")}</p>
        </section>
      </div>
    </div>
  );
}
