"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PaymentActions } from "@/components/payment-actions";
import {
  useFormatDateTime,
  useLang,
  useT,
} from "@/components/language-provider";
import { getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { PAYMENT_STATUS_COLOR, cn, formatYen, isPaymentStatus } from "@/lib/utils";

export interface PaymentDetailData {
  id: string;
  orderNumber: string;
  amount: number;
  status: string;
  externalId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  description: string | null;
  createdAt: Date;
  capturedAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
  provider: {
    id: string;
    displayName: string;
    providerKey: string;
    testMode: boolean;
  };
}

export function PaymentDetailView({ payment }: { payment: PaymentDetailData }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const def = getProviderDefinition(payment.provider.providerKey);
  const providerName = def ? pickText(def.name, lang) : payment.provider.providerKey;

  return (
    <div>
      <PageHeader
        title={t("paymentDetail.title", { orderNumber: payment.orderNumber })}
        description={`${providerName} · ${payment.provider.displayName}`}
        breadcrumbs={[
          { label: t("paymentDetail.breadcrumbPayments"), href: "/payments" },
          { label: payment.orderNumber },
        ]}
        actions={
          <span
            className={cn(
              "badge",
              PAYMENT_STATUS_COLOR[payment.status] ??
                "bg-slate-100 text-slate-700 ring-slate-200",
            )}
          >
            {isPaymentStatus(payment.status)
              ? t(`status.${payment.status}`)
              : payment.status}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="card divide-y divide-slate-100">
          <Row label={t("paymentDetail.amount")}>
            <span className="text-lg font-semibold tabular-nums">
              {formatYen(payment.amount)}
            </span>
          </Row>
          <Row label={t("paymentDetail.provider")}>
            <Link
              href={`/providers/${payment.provider.id}`}
              className="text-brand-700 hover:underline"
            >
              {payment.provider.displayName}
            </Link>
            <span className="ml-2 text-xs text-slate-500">({providerName})</span>
          </Row>
          <Row label={t("paymentDetail.mode")}>
            <span
              className={cn(
                "badge",
                payment.provider.testMode
                  ? "bg-amber-100 text-amber-800 ring-amber-200"
                  : "bg-emerald-100 text-emerald-800 ring-emerald-200",
              )}
            >
              {payment.provider.testMode ? t("common.test") : t("common.live")}
            </span>
          </Row>
          <Row label={t("paymentDetail.externalId")}>
            <span className="font-mono text-xs">{payment.externalId ?? "—"}</span>
          </Row>
          <Row label={t("paymentDetail.customer")}>
            <div>
              {payment.customerName ?? "—"}
              {payment.customerEmail && (
                <p className="text-xs text-slate-500">{payment.customerEmail}</p>
              )}
            </div>
          </Row>
          <Row label={t("paymentDetail.memo")}>
            <span className="whitespace-pre-wrap text-sm">
              {payment.description || "—"}
            </span>
          </Row>
          <Row label={t("paymentDetail.createdAt")}>
            {formatDate(payment.createdAt)}
          </Row>
          {payment.capturedAt && (
            <Row label={t("paymentDetail.capturedAt")}>
              {formatDate(payment.capturedAt)}
            </Row>
          )}
          {payment.cancelledAt && (
            <Row label={t("paymentDetail.cancelledAt")}>
              {formatDate(payment.cancelledAt)}
            </Row>
          )}
          {payment.refundedAt && (
            <Row label={t("paymentDetail.refundedAt")}>
              {formatDate(payment.refundedAt)}
            </Row>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("paymentDetail.actions")}
            </p>
            <div className="mt-3">
              <PaymentActions id={payment.id} status={payment.status} />
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              {t("paymentDetail.demoNoteTitle")}
            </p>
            <p className="mt-1">{t("paymentDetail.demoNoteBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-3 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-right text-slate-800">{children}</span>
    </div>
  );
}
