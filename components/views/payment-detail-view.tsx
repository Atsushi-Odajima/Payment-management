"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PaymentActions } from "@/components/payment-actions";
import { ModeBadge, PaymentStatusBadge } from "@/components/payment-status-badge";
import { DetailRow } from "@/components/ui/detail-row";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { getProviderDefinition } from "@/lib/providers/registry";
import { pickText, type MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/payments/transitions";

export interface PaymentEventItem {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  amount: number | null;
  actor: string;
  createdAt: Date;
}

export interface RefundItem {
  id: string;
  amount: number;
  reason: string | null;
  createdAt: Date;
}

export interface PaymentDetailData {
  id: string;
  orderNumber: string;
  amount: number;
  amountRefunded: number;
  status: PaymentStatus;
  livemode: boolean;
  externalId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  description: string | null;
  createdAt: Date;
  provider: {
    id: string;
    displayName: string;
    providerKey: string;
    webhookAvailable: boolean;
  };
  events: PaymentEventItem[];
  refunds: RefundItem[];
}

export function PaymentDetailView({ payment }: { payment: PaymentDetailData }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const def = getProviderDefinition(payment.provider.providerKey);
  const providerName = def ? pickText(def.name, lang) : payment.provider.providerKey;
  const remaining = payment.amount - payment.amountRefunded;

  return (
    <div>
      <PageHeader
        title={t("paymentDetail.title", { orderNumber: payment.orderNumber })}
        description={`${providerName} · ${payment.provider.displayName}`}
        helpHref="/manual/payments"
        breadcrumbs={[
          { label: t("paymentDetail.breadcrumbPayments"), href: "/payments" },
          { label: payment.orderNumber },
        ]}
        actions={
          <>
            <ModeBadge live={payment.livemode} />
            <PaymentStatusBadge status={payment.status} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <div className="card divide-y divide-slate-100">
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
            <DetailRow label={t("paymentDetail.customer")}>
              <div>
                {payment.customerName ?? "—"}
                {payment.customerEmail && <p className="text-xs text-slate-500">{payment.customerEmail}</p>}
              </div>
            </DetailRow>
            <DetailRow label={t("paymentDetail.memo")}>
              <span className="whitespace-pre-wrap text-sm">{payment.description || "—"}</span>
            </DetailRow>
            <DetailRow label={t("paymentDetail.createdAt")}>{formatDate(payment.createdAt)}</DetailRow>
          </div>

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
                    {e.amount != null && (
                      <span className="tabular-nums text-xs text-slate-600">{formatYen(e.amount)}</span>
                    )}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("paymentDetail.actions")}
            </p>
            <div className="mt-3">
              <PaymentActions
                id={payment.id}
                orderNumber={payment.orderNumber}
                status={payment.status}
                amount={payment.amount}
                amountRefunded={payment.amountRefunded}
                webhookAvailable={payment.provider.webhookAvailable}
              />
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
    default:
      return "paymentDetail.eventOther";
  }
}

function actorLabelKey(actor: string): MessageKey {
  switch (actor) {
    case "webhook":
      return "paymentDetail.actorWebhook";
    case "seed":
      return "paymentDetail.actorSeed";
    case "system":
      return "paymentDetail.actorSystem";
    default:
      return "paymentDetail.actorDashboard";
  }
}

function statusLabel(t: (k: MessageKey) => string, status: string): string {
  switch (status) {
    case "pending":
    case "authorized":
    case "captured":
    case "partially_refunded":
    case "refunded":
    case "cancelled":
    case "failed":
      return t(`status.${status}`);
    default:
      return status;
  }
}
