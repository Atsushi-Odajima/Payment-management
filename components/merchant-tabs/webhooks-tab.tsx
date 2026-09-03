"use client";

// Merchant "Webhook log" tab (E): the merchant's recent deliveries for the
// current mode, linking to the full log.

import Link from "next/link";
import { useFormatDateTime, useT } from "@/components/language-provider";
import { HttpStatusBadge, WebhookStatusBadge } from "@/components/webhook-badges";
import type { WebhookRow } from "@/lib/webhooks/list";

export function WebhooksTab({ merchantId, rows }: { merchantId: string; rows: WebhookRow[] }) {
  const t = useT();
  const formatDate = useFormatDateTime();
  return (
    <section className="card overflow-hidden" aria-labelledby="wh-tab">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 id="wh-tab" className="text-sm font-semibold text-slate-800">
          {t("webhookLogs.tabTitle")}
        </h2>
        <Link href={`/webhook-logs?merchant=${merchantId}`} className="text-xs font-medium text-brand-700 hover:underline">
          {t("webhookLogs.openList")}
        </Link>
      </div>
      <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{t("webhookLogs.tabHelp")}</p>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">{t("webhookLogs.empty")}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/webhook-logs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="font-mono text-xs text-slate-800">{r.event}</span>
                  <span className="ml-2 text-xs text-slate-500">{formatDate(r.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <HttpStatusBadge status={r.responseStatus} />
                  <WebhookStatusBadge status={r.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
