"use client";

// One audit entry: metadata plus the before / after snapshots side by side,
// with changed keys highlighted.

import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { useAuditLabels } from "@/components/audit-labels";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { AuditDetail } from "@/lib/audit-list";
import { cn } from "@/lib/utils";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function show(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export function AuditLogDetailView({ log }: { log: AuditDetail }) {
  const t = useT();
  const labels = useAuditLabels();
  const formatDate = useFormatDateTime();
  const before = isRecord(log.before) ? log.before : null;
  const after = isRecord(log.after) ? log.after : null;
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));

  return (
    <div>
      <PageHeader
        title={labels.action(log.action)}
        description={`${labels.targetType(log.targetType)}${log.targetId ? ` · ${log.targetId}` : ""}`}
        helpHref="/manual/admins"
        breadcrumbs={[{ label: t("audit.title"), href: "/audit-logs" }, { label: log.id }]}
      />
      <div className="space-y-6">
        <section className="card divide-y divide-slate-100" aria-labelledby="audit-meta">
          <h2 id="audit-meta" className="px-5 py-3 text-sm font-semibold text-slate-800">
            {t("audit.detailTitle")}
          </h2>
          <DetailRow label={t("audit.thAt")}>{formatDate(log.createdAt)}</DetailRow>
          <DetailRow label={t("audit.thActor")}>
            {log.actor ? (
              <span>
                {log.actor.name} <span className="font-mono text-xs text-slate-500">{log.actor.loginId}</span>
              </span>
            ) : log.merchant ? (
              <span>
                {labels.actorType(log.actorType)} <span className="font-mono text-xs text-slate-500">{log.merchant.merchantCode}</span> <span className="text-xs text-slate-500">{log.merchant.siteName}</span>
              </span>
            ) : (
              labels.actorType(log.actorType)
            )}
          </DetailRow>
          <DetailRow label={t("audit.thAction")}>
            {labels.action(log.action)} <span className="ml-1 font-mono text-xs text-slate-500">{log.action}</span>
          </DetailRow>
          <DetailRow label={t("audit.thTarget")}>
            {labels.targetType(log.targetType)}
            {log.targetId && <span className="ml-1 font-mono text-xs text-slate-500">{log.targetId}</span>}
          </DetailRow>
          <DetailRow label={t("audit.thIp")}>
            <span className="font-mono text-xs">{log.ip ?? "—"}</span>
          </DetailRow>
        </section>

        <section className="card overflow-hidden" aria-labelledby="audit-diff">
          <h2 id="audit-diff" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
            {t("audit.diffTitle")}
          </h2>
          {keys.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("audit.noChange")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-2">{t("audit.field")}</th>
                    <th scope="col" className="px-5 py-2">{t("audit.before")}</th>
                    <th scope="col" className="px-5 py-2">{t("audit.after")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keys.map((k) => {
                    const b = before?.[k];
                    const a = after?.[k];
                    const changed = show(b) !== show(a);
                    return (
                      <tr key={k} className={cn(changed && "bg-amber-50/60")}>
                        <td className="px-5 py-2 font-mono text-xs text-slate-700">{k}</td>
                        <td className={cn("px-5 py-2 font-mono text-xs", changed ? "text-rose-700" : "text-slate-500")}>{before ? show(b) || "—" : "—"}</td>
                        <td className={cn("px-5 py-2 font-mono text-xs", changed ? "font-semibold text-emerald-800" : "text-slate-500")}>{after ? show(a) || "—" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
