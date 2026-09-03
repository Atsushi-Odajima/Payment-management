"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HttpStatusBadge, WebhookStatusBadge } from "@/components/webhook-badges";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import type { WebhookRow } from "@/lib/webhooks/list";
import { popFlash, pushFlash } from "@/lib/flash";

export function MerchantWebhooksView({ rows }: { rows: WebhookRow[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(() => {
    const flash = popFlash("merchant:webhook");
    return flash ? { ok: !flash.startsWith("!"), text: flash.replace(/^!/, "") } : null;
  });

  async function resend(id: string) {
    setBusy(id);
    setNotice(null);
    const res = await apiJson<{ status: string; responseStatus: number | null; error: string | null }>(`/api/merchant-portal/webhooks/${id}/resend`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setNotice({ ok: false, text: res.error.message });
      return;
    }
    const next = res.data.status === "success" ? { ok: true, text: t("merchantPortal.webhooks.resent", { status: res.data.responseStatus ?? "" }) } : { ok: false, text: t("merchantPortal.webhooks.resendFailed", { error: res.data.error ?? String(res.data.responseStatus ?? "") }) };
    setNotice(next);
    pushFlash("merchant:webhook", `${next.ok ? "" : "!"}${next.text}`);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.webhooks.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.webhooks.description")}</p>
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`mt-4 rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {notice.text}
        </p>
      )}
      <div className="card mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{t("merchantPortal.webhooks.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("merchantPortal.webhooks.thAt")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.webhooks.thEvent")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.webhooks.thUrl")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.webhooks.thStatus")}</th>
                  <th className="px-5 py-3 text-right">{t("merchantPortal.webhooks.thAttempts")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.webhooks.thResponse")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{formatDate(r.lastSentAt ?? r.createdAt)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-800">{r.event}</td>
                    <td className="max-w-[240px] truncate px-5 py-3 font-mono text-xs text-slate-500" title={r.url}>
                      {r.method} {r.url}
                    </td>
                    <td className="px-5 py-3">
                      <WebhookStatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.attempts}</td>
                    <td className="px-5 py-3">
                      <HttpStatusBadge status={r.responseStatus} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy !== null} onClick={() => resend(r.id)}>
                        {busy === r.id ? t("common.processing") : t("merchantPortal.webhooks.resend")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
