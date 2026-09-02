"use client";

// Transaction detail shared by /payments/[id] and /applications/[id]:
// transaction info, bank-transfer block, status change history, refunds and
// the (role-gated) actions.

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PaymentActions } from "@/components/payment-actions";
import { ModeBadge, PaymentStatusBadge } from "@/components/payment-status-badge";
import { DetailRow } from "@/components/ui/detail-row";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { methodLabel } from "@/components/views/transactions-view";
import { getProviderDefinition } from "@/lib/providers/registry";
import { pickText, type MessageKey } from "@/lib/i18n";
import { isPaymentStatus } from "@/lib/payments/transitions";
import type { TransactionDetail } from "@/lib/payments/detail";
import { cn, formatYen } from "@/lib/utils";

export type DetailOrigin = "payments" | "applications";

export function PaymentDetailView({ payment, origin }: { payment: TransactionDetail; origin: DetailOrigin }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const def = getProviderDefinition(payment.provider.providerKey);
  const providerName = def ? pickText(def.name, lang) : payment.provider.providerKey;
  const remaining = payment.amount - payment.amountRefunded;
  const isBank = payment.transferId !== null;

  return (
    <div>
      <PageHeader
        title={t("paymentDetail.title", { orderNumber: payment.orderNumber })}
        description={`${methodLabel(payment.method, lang)} · ${providerName} · ${payment.provider.displayName}`}
        helpHref={origin === "applications" ? "/manual/applications" : "/manual/payments"}
        breadcrumbs={[
          origin === "applications"
            ? { label: t("paymentDetail.breadcrumbApplications"), href: "/applications" }
            : { label: t("paymentDetail.breadcrumbPayments"), href: "/payments" },
          { label: payment.orderNumber },
        ]}
        actions={
          <>
            <ModeBadge live={payment.livemode} />
            <PaymentStatusBadge status={payment.status} />
            {payment.overdue && <span className="badge bg-rose-600 text-white ring-rose-700">{t("transactions.overdue")}</span>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="txn-heading">
            <h2 id="txn-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("paymentDetail.sectionTransaction")}
            </h2>
            <DetailRow label={t("paymentDetail.transactionId")}>
              <span className="font-mono text-xs">{payment.id}</span>
            </DetailRow>
            <DetailRow label={t("paymentDetail.amount")}>
              <span className="text-lg font-semibold tabular-nums">{formatYen(payment.amount)}</span>
            </DetailRow>
            {payment.amountRefunded > 0 && (
              <>
                <DetailRow label={t("paymentDetail.amountRefunded")}>
                  <span className="tabular-nums text-purple-700">−{formatYen(payment.amountRefunded)}</span>
                </DetailRow>
                <DetailRow label={t("paymentDetail.amountRemaining")}>
                  <span className="tabular-nums">{formatYen(remaining)}</span>
                </DetailRow>
              </>
            )}
            <DetailRow label={t("paymentDetail.merchant")}>
              {payment.merchant ? (
                <Link href={`/merchants/${payment.merchant.id}`} className="text-brand-700 hover:underline">
                  {payment.merchant.merchantCode} — {payment.merchant.siteName}
                </Link>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </DetailRow>
            <DetailRow label={t("paymentDetail.product")}>{payment.productName ?? "—"}</DetailRow>
            <DetailRow label={t("paymentDetail.customer")}>
              <div>
                {payment.customerName ?? "—"}
                {payment.customerEmail && <p className="text-xs text-slate-500">{payment.customerEmail}</p>}
              </div>
            </DetailRow>
            <DetailRow label={t("paymentDetail.customerId")}>
              <span className="font-mono text-xs">{payment.customerId ?? "—"}</span>
            </DetailRow>
            <DetailRow label={t("paymentDetail.method")}>{methodLabel(payment.method, lang)}</DetailRow>
            <DetailRow label={t("paymentDetail.provider")}>
              <Link href={`/providers/${payment.provider.id}`} className="text-brand-700 hover:underline">
                {payment.provider.displayName}
              </Link>
              <span className="ml-2 text-xs text-slate-500">({providerName})</span>
            </DetailRow>
            <DetailRow label={t("paymentDetail.mode")}>
              <ModeBadge live={payment.livemode} />
            </DetailRow>
            <DetailRow label={t("paymentDetail.externalId")}>
              <span className="font-mono text-xs">{payment.externalId ?? "—"}</span>
            </DetailRow>
            <DetailRow label={t("paymentDetail.appliedAt")}>{formatDate(payment.createdAt)}</DetailRow>
            <DetailRow label={t("paymentDetail.completedAt")}>{payment.capturedAt ? formatDate(payment.capturedAt) : "—"}</DetailRow>
            <DetailRow label={t("paymentDetail.memo")}>
              <span className="whitespace-pre-wrap text-sm">{payment.description || "—"}</span>
            </DetailRow>
          </section>

          {isBank && (
            <section className={cn("card divide-y divide-slate-100", payment.overdue && "border-rose-300")} aria-labelledby="transfer-heading">
              <h2 id="transfer-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
                {t("paymentDetail.sectionTransfer")}
              </h2>
              <DetailRow label={t("paymentDetail.transferId")}>
                <span className="font-mono text-base font-semibold tracking-wider">{payment.transferId}</span>
              </DetailRow>
              <DetailRow label={t("paymentDetail.transferDueAt")}>
                <span className={cn(payment.overdue && "font-semibold text-rose-700")}>
                  {payment.transferDueAt ? formatDate(payment.transferDueAt) : "—"}
                </span>
                {payment.overdue && <span className="badge ml-2 bg-rose-600 text-white ring-rose-700">{t("transactions.overdue")}</span>}
              </DetailRow>
              <DetailRow label={t("paymentDetail.depositAmount")}>
                <span className="tabular-nums">{payment.depositAmount != null ? formatYen(payment.depositAmount) : "—"}</span>
              </DetailRow>
              <DetailRow label={t("paymentDetail.depositDiff")}>
                {payment.depositDiff === "short" ? (
                  <span className="badge bg-rose-100 text-rose-800 ring-rose-200">
                    {t("paymentDetail.diff_short")} (−{formatYen(payment.amount - (payment.depositAmount ?? 0))})
                  </span>
                ) : payment.depositDiff === "excess" ? (
                  <span className="badge bg-amber-100 text-amber-800 ring-amber-200">
                    {t("paymentDetail.diff_excess")} (+{formatYen((payment.depositAmount ?? 0) - payment.amount)})
                  </span>
                ) : payment.depositAmount != null ? (
                  <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">{t("paymentDetail.diff_none")}</span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </DetailRow>
            </section>
          )}

          <section className="card" aria-labelledby="events-heading">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="events-heading" className="text-sm font-semibold text-slate-900">
                {t("paymentDetail.events")}
              </h2>
            </div>
            {payment.events.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{t("paymentDetail.noEvents")}</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {payment.events.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">
                        {t(eventLabelKey(e.type))}
                        {e.toStatus && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {e.fromStatus ? `${statusLabel(t, e.fromStatus)} → ` : ""}
                            {statusLabel(t, e.toStatus)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t(actorLabelKey(e.actor))} · {formatDate(e.createdAt)}
                      </p>
                    </div>
                    {e.amount != null && <span className="tabular-nums text-xs text-slate-600">{formatYen(e.amount)}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {payment.refunds.length > 0 && (
            <section className="card" aria-labelledby="refunds-heading">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 id="refunds-heading" className="text-sm font-semibold text-slate-900">
                  {t("paymentDetail.refunds")}
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {payment.refunds.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                    <div>
                      <p className="text-slate-800">{r.reason || t("paymentDetail.noReason")}</p>
                      <p className="text-xs text-slate-500">{formatDate(r.createdAt)}</p>
                    </div>
                    <span className="tabular-nums font-medium text-purple-700">−{formatYen(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3">
              <PaymentActions payment={payment} />
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("paymentDetail.demoNoteTitle")}</p>
            <p className="mt-1">{t("paymentDetail.demoNoteBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function eventLabelKey(type: string): MessageKey {
  switch (type) {
    case "created":
      return "paymentDetail.eventCreated";
    case "capture":
      return "paymentDetail.eventCapture";
    case "cancel":
      return "paymentDetail.eventCancel";
    case "refund":
      return "paymentDetail.eventRefund";
    case "fail":
      return "paymentDetail.eventFail";
    case "expire":
      return "paymentDetail.eventExpire";
    case "deposit":
      return "paymentDetail.eventDeposit";
    default:
      return "paymentDetail.eventOther";
  }
}

function actorLabelKey(actor: string): MessageKey {
  switch (actor) {
    case "webhook":
      return "paymentDetail.actorWebhook";
    case "bank":
      return "paymentDetail.actorBank";
    case "seed":
      return "paymentDetail.actorSeed";
    case "system":
      return "paymentDetail.actorSystem";
    default:
      return "paymentDetail.actorDashboard";
  }
}

function statusLabel(t: (k: MessageKey) => string, status: string): string {
  return isPaymentStatus(status) ? t(`status.${status}`) : status;
}
