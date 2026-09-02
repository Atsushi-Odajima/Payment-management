"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ModeFilterChips } from "@/components/mode-filter";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { cn, formatYen, type ModeFilter } from "@/lib/utils";
import { PAYMENT_STATUSES, type PaymentStatus } from "@/lib/payments/transitions";

export interface PaymentListItem {
  id: string;
  orderNumber: string;
  externalId: string | null;
  providerKey: string;
  providerDisplayName: string;
  customerName: string | null;
  customerEmail: string | null;
  amount: number;
  amountRefunded: number;
  status: PaymentStatus;
  livemode: boolean;
  createdAt: Date;
}

export interface PaymentsViewProps {
  status: PaymentStatus | "all";
  mode: ModeFilter;
  payments: PaymentListItem[];
  capturedAmount: number;
  capturedCount: number;
}

export function PaymentsView(props: PaymentsViewProps) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const modeParam = props.mode === "all" ? undefined : props.mode;

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
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={t("payments.thStatus")}
            className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
          >
            <FilterLink
              href={withQuery("/payments", { mode: modeParam })}
              active={props.status === "all"}
              label={t("payments.filterAll")}
            />
            {PAYMENT_STATUSES.map((key) => (
              <FilterLink
                key={key}
                href={withQuery("/payments", { status: key, mode: modeParam })}
                active={props.status === key}
                label={t(`status.${key}`)}
              />
            ))}
          </div>
          <ModeFilterChips
            basePath="/payments"
            current={props.mode}
            params={{ status: props.status === "all" ? undefined : props.status }}
          />
        </div>
        <p className="text-xs text-slate-500">
          {t("payments.capturedTotal")}{" "}
          <span className="font-semibold text-slate-800 tabular-nums">{formatYen(props.capturedAmount)}</span>{" "}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">{t("payments.thOrderNumber")}</th>
                  <th scope="col" className="px-5 py-3">{t("payments.thProvider")}</th>
                  <th scope="col" className="px-5 py-3">{t("payments.thCustomer")}</th>
                  <th scope="col" className="px-5 py-3 text-right">{t("payments.thAmount")}</th>
                  <th scope="col" className="px-5 py-3">{t("payments.thStatus")}</th>
                  <th scope="col" className="px-5 py-3">{t("payments.thCreatedAt")}</th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">{t("payments.thActions")}</span>
                  </th>
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
                        {p.externalId && <p className="text-xs text-slate-500">{p.externalId}</p>}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        <span className="flex items-center gap-1.5">
                          {def ? pickText(def.name, lang) : p.providerKey}
                          {!p.livemode && (
                            <span className="whitespace-nowrap rounded bg-amber-50 px-1 text-[10px] text-amber-700">
                              {t("common.test")}
                            </span>
                          )}
                        </span>
                        <p className="text-xs text-slate-500">{p.providerDisplayName}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {p.customerName ?? "—"}
                        {p.customerEmail && <p className="text-xs text-slate-500">{p.customerEmail}</p>}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">
                        {formatYen(p.amount)}
                        {p.amountRefunded > 0 && (
                          <p className="text-xs font-normal text-purple-700">−{formatYen(p.amountRefunded)}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <PaymentStatusBadge status={p.status} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDate(p.createdAt)}</td>
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
          </div>
        )}
      </div>
    </div>
  );
}

function withQuery(base: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition",
        active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {label}
    </Link>
  );
}
