"use client";

// Email log (Phase G-2): every message the system produced (demo: recorded, not sent).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { EmailLogFilters, EmailLogRow } from "@/lib/email/list";
import { EMAIL_LOG_STATUSES, EMAIL_TEMPLATE_KEYS } from "@/lib/email/templates";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
  demo: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function EmailStatusBadge({ status }: { status: string }) {
  const t = useT();
  return <span className={cn("badge", STATUS_CLASS[status] ?? STATUS_CLASS.demo)}>{t(`emailEnums.status.${status}` as MessageKey)}</span>;
}

export function EmailLogsView({ rows, total, page, pageSize, sort, filters }: { rows: EmailLogRow[]; total: number; page: number; pageSize: number; sort: SortState; filters: EmailLogFilters }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    template: filters.template || undefined,
    status: filters.status || undefined,
    to: filters.to || undefined,
    from: filters.from || undefined,
    until: filters.to_ || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/email-logs", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.template || filters.status || filters.to || filters.from || filters.to_);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("format", "csv");

  const columns: DataColumn<EmailLogRow>[] = [
    { key: "createdAt", header: t("emailLogs.thAt"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
    { key: "to", header: t("emailLogs.thTo"), render: (r) => <span className="font-mono text-xs">{r.to}</span> },
    { key: "templateKey", header: t("emailLogs.thTemplate"), sortable: true, render: (r) => <span>{t(`emailEnums.key.${r.templateKey}` as MessageKey)}</span> },
    { key: "subject", header: t("emailLogs.thSubject"), render: (r) => <span className="block max-w-[320px] truncate text-slate-800">{r.subject}</span> },
    { key: "status", header: t("emailLogs.thStatus"), sortable: true, render: (r) => <EmailStatusBadge status={r.status} /> },
    { key: "lang", header: t("emailLogs.thLang"), render: (r) => <span className="uppercase text-xs text-slate-600">{r.lang}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("emailLogs.title")} description={t("emailLogs.description")} helpHref="/manual/emails" />
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("emailLogs.filterTemplate")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.template} onChange={(e) => go({ template: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {EMAIL_TEMPLATE_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`emailEnums.key.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("emailLogs.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {EMAIL_LOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`emailEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("emailLogs.filterTo")}</span>
          <input className="input w-auto py-1.5 text-xs" defaultValue={filters.to} onBlur={(e) => e.target.value !== filters.to && go({ to: e.target.value || undefined })} onKeyDown={(e) => e.key === "Enter" && go({ to: (e.target as HTMLInputElement).value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("emailLogs.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("emailLogs.filterUntil")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to_} onChange={(e) => go({ until: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/email-logs" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("emailLogs.filterClear")}
          </Link>
        )}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/email-logs/${r.id}`} basePath="/email-logs" params={params} sort={sort} total={total} page={page} pageSize={pageSize} csvHref={`/api/email-logs?${csvQuery.toString()}`} emptyText={t("emailLogs.empty")} />
    </div>
  );
}
