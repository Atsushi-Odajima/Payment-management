"use client";

// Webhook delivery detail: request (headers + body), last response, every
// attempt, and the master's manual resend.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { HttpStatusBadge, WebhookStatusBadge } from "@/components/webhook-badges";
import { ModeBadge, PaymentStatusBadge } from "@/components/payment-status-badge";
import { useConfirm } from "@/components/confirm-dialog";
import { isPaymentStatus } from "@/lib/payments/transitions";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useCan } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { WebhookDetail } from "@/lib/webhooks/list";
import type { MessageKey } from "@/lib/i18n";

export function WebhookLogDetailView({ delivery }: { delivery: WebhookDetail }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isMaster = useCan("webhook", "resend");
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    // Phase P3-6: show what the merchant will receive again before sending.
    const ok = await confirm({
      title: t("webhookLogs.resend"),
      body: t("webhookLogs.resendConfirmBody", {
        event: delivery.event,
        order: delivery.payment?.orderNumber ?? "—",
        status: delivery.payment && isPaymentStatus(delivery.payment.status) ? t(`status.${delivery.payment.status}`) : "—",
        lastSuccess: delivery.lastSuccess?.lastSentAt ? formatDate(delivery.lastSuccess.lastSentAt) : t("webhookLogs.resendNoSuccess"),
      }),
      confirmLabel: t("webhookLogs.resend"),
      tone: delivery.lastSuccess ? "danger" : "primary",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await apiJson<{ ok: boolean; responseStatus: number | null; error: string | null }>(`/api/webhook-logs/${delivery.id}/resend`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(res.data.ok ? t("webhookLogs.resent") : t("webhookLogs.resentFailed", { status: res.data.responseStatus ?? res.data.error ?? "" }), res.data.ok ? "success" : "error");
    router.refresh();
  }

  const pretty = (s: string | null) => {
    if (!s) return "—";
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  };

  return (
    <div>
      <PageHeader
        title={t("webhookLogs.detailTitle", { event: delivery.event })}
        description={`${delivery.merchant.merchantCode} · ${delivery.merchant.siteName}`}
        helpHref="/manual/webhooks"
        breadcrumbs={[{ label: t("webhookLogs.title"), href: "/webhook-logs" }, { label: delivery.id }]}
        actions={
          <>
            <ModeBadge live={delivery.livemode} />
            <WebhookStatusBadge status={delivery.status} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="wh-summary">
            <h2 id="wh-summary" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("webhookLogs.sectionSummary")}
            </h2>
            <DetailRow label={t("webhookLogs.thMerchant")}>
              <Link href={`/merchants/${delivery.merchant.id}?tab=webhooks`} className="text-brand-700 hover:underline">
                {delivery.merchant.merchantCode} — {delivery.merchant.siteName}
              </Link>
            </DetailRow>
            <DetailRow label={t("webhookLogs.thEvent")}>
              <span className="font-mono text-xs">{delivery.event}</span>
            </DetailRow>
            <DetailRow label={t("webhookLogs.payment")}>
              {delivery.payment ? (
                <span className="flex flex-wrap items-center gap-2" data-testid="webhook-payment">
                  <Link href={`/payments/${delivery.payment.id}`} className="font-medium text-brand-700 hover:underline">
                    {delivery.payment.orderNumber}
                  </Link>
                  {isPaymentStatus(delivery.payment.status) && <PaymentStatusBadge status={delivery.payment.status} />}
                  <span className="text-xs text-slate-500">{t("webhookLogs.paymentUpdatedAt", { at: formatDate(delivery.payment.updatedAt) })}</span>
                </span>
              ) : delivery.paymentId ? (
                <span className="font-mono text-xs text-slate-500">{delivery.paymentId}</span>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label={t("webhookLogs.lastSuccess")}>
              {delivery.lastSuccess ? (
                <Link href={`/webhook-logs/${delivery.lastSuccess.id}`} className="text-brand-700 hover:underline">
                  {delivery.lastSuccess.lastSentAt ? formatDate(delivery.lastSuccess.lastSentAt) : delivery.lastSuccess.id}
                </Link>
              ) : (
                <span className="text-slate-500">{t("webhookLogs.resendNoSuccess")}</span>
              )}
            </DetailRow>
            <DetailRow label={t("webhookLogs.thUrl")}>
              <span className="break-all font-mono text-xs">
                {delivery.method} {delivery.url}
              </span>
            </DetailRow>
            <DetailRow label={t("webhookLogs.thStatus")}>
              <WebhookStatusBadge status={delivery.status} />
            </DetailRow>
            <DetailRow label={t("webhookLogs.thResponse")}>
              <HttpStatusBadge status={delivery.responseStatus} />
            </DetailRow>
            <DetailRow label={t("webhookLogs.thAttempts")}>{delivery.attempts}</DetailRow>
            <DetailRow label={t("webhookLogs.lastSentAt")}>{delivery.lastSentAt ? formatDate(delivery.lastSentAt) : "—"}</DetailRow>
            <DetailRow label={t("webhookLogs.nextRetryAt")}>{delivery.nextRetryAt ? formatDate(delivery.nextRetryAt) : "—"}</DetailRow>
            <DetailRow label={t("webhookLogs.createdAt")}>{formatDate(delivery.createdAt)}</DetailRow>
          </section>

          <section className="card" aria-labelledby="wh-request">
            <h2 id="wh-request" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
              {t("webhookLogs.sectionRequest")}
            </h2>
            <div className="space-y-3 p-5 text-xs">
              <p className="font-medium text-slate-600">{t("webhookLogs.headers")}</p>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                {Object.entries(delivery.requestHeaders)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")}
              </pre>
              <p className="font-medium text-slate-600">{t("webhookLogs.body")}</p>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{pretty(delivery.requestBody)}</pre>
            </div>
          </section>

          <section className="card" aria-labelledby="wh-response">
            <h2 id="wh-response" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
              {t("webhookLogs.sectionResponse")}
            </h2>
            <div className="p-5 text-xs">
              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800">{pretty(delivery.responseBody)}</pre>
            </div>
          </section>

          <section className="card overflow-hidden" aria-labelledby="wh-attempts">
            <h2 id="wh-attempts" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
              {t("webhookLogs.sectionAttempts", { count: delivery.attemptLog.length })}
            </h2>
            {delivery.attemptLog.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{t("webhookLogs.noAttempts")}</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {delivery.attemptLog.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">
                        #{a.attemptNo} · {t(`webhookEnums.trigger.${a.trigger}` as MessageKey)}
                        {a.error && <span className="ml-2 text-xs text-rose-700">{a.error}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(a.sentAt)}
                        {a.durationMs != null && ` · ${a.durationMs} ms`}
                      </p>
                    </div>
                    <HttpStatusBadge status={a.responseStatus} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3 space-y-2">
              <button type="button" className="btn-primary w-full" disabled={!isMaster || busy} onClick={resend}>
                {busy ? t("common.processing") : t("webhookLogs.resend")}
              </button>
              <p className="text-[11px] leading-snug text-slate-500">{t("webhookLogs.resendHint")}</p>
              {!isMaster && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("webhookLogs.masterOnly")}</p>}
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("webhookLogs.retryTitle")}</p>
            <p className="mt-1">{t("webhookLogs.retryBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
