"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  useFormatDateTime,
  useLang,
  useT,
} from "@/components/language-provider";
import { getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import {
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUSES,
  cn,
  formatYen,
  isPaymentStatus,
} from "@/lib/utils";

export interface PaymentListItem {
  id: string;
  orderNumber: string;
  externalId: string | null;
  providerKey: string;
  providerDisplayName: string;
  customerName: string | null;
  customerEmail: string | null;
  amount: number;
  status: string;
  createdAt: Date;
}

export interface PaymentsViewProps {
  status: string;
  payments: PaymentListItem[];
  capturedAmount: number;
  capturedCount: number;
}

const FILTER_KEYS = [
  "pending",
  "authorized",
  "captured",
  "cancelled",
  "refunded",
] as const satisfies readonly (typeof PAYMENT_STATUSES)[number][];

export function PaymentsView(props: PaymentsViewProps) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();

  return (
    <div>
      <PageHeader
        title={t("payments.title")}
        description={t("payments.description")}
        actions={
          <Link href="/payments/new" className="btn-primary">
            {t("payments.createPayment")}
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <FilterLink
            href="/payments"
            active={props.status === "all"}
            label={t("payments.filterAll")}
          />
          {FILTER_KEYS.map((key) => (
            <FilterLink
              key={key}
              href={`/payments?status=${key}`}
              active={props.status === key}
              label={t(`status.${key}`)}
            />
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {t("payments.capturedTotal")}{" "}
          <span className="font-semibold text-slate-800">
            {formatYen(props.capturedAmount)}
          </span>{" "}
          {t("payments.capturedCount", { count: props.capturedCount })}
        </p>
      </div>

      <div className="card overflow-hidden">
        {props.payments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            {t("payments.empty")}
            <div className="mt-4">
              <Link href="/payments/new" className="btn-primary">
                {t("payments.emptyCta")}
              </Link>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">{t("payments.thOrderNumber")}</th>
                <th className="px-5 py-3">{t("payments.thProvider")}</th>
                <th className="px-5 py-3">{t("payments.thCustomer")}</th>
                <th className="px-5 py-3 text-right">{t("payments.thAmount")}</th>
                <th className="px-5 py-3">{t("payments.thStatus")}</th>
                <th className="px-5 py-3">{t("payments.thCreatedAt")}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {props.payments.map((p) => {
                const def = getProviderDefinition(p.providerKey);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <Link href={`/payments/${p.id}`} className="hover:text-brand-700">
                        {p.orderNumber}
                      </Link>
                      {p.externalId && (
                        <p className="text-xs text-slate-500">{p.externalId}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {def ? pickText(def.name, lang) : p.providerKey}
                      <p className="text-xs text-slate-500">{p.providerDisplayName}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {p.customerName ?? "—"}
                      {p.customerEmail && (
                        <p className="text-xs text-slate-500">{p.customerEmail}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">
                      {formatYen(p.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "badge",
                          PAYMENT_STATUS_COLOR[p.status] ??
                            "bg-slate-100 text-slate-700 ring-slate-200",
                        )}
                      >
                        {isPaymentStatus(p.status) ? t(`status.${p.status}`) : p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/payments/${p.id}`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        {t("payments.detail")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition",
        active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {label}
    </Link>
  );
}
