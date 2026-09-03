"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { CustomerDetail, CustomerRow } from "@/lib/customers/list";
import { isPaymentStatus } from "@/lib/payments/transitions";
import { formatYen } from "@/lib/utils";

export function MerchantCustomersView({ rows, total, page, pageSize, q }: { rows: CustomerRow[]; total: number; page: number; pageSize: number; q: string }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.customers.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.customers.description")}</p>
      <div className="mt-4 flex items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("merchantPortal.customers.search")}</span>
          <input className="input w-64 py-1.5 text-xs" defaultValue={q} onKeyDown={(e) => e.key === "Enter" && router.push(`/merchant/customers${(e.target as HTMLInputElement).value ? `?q=${encodeURIComponent((e.target as HTMLInputElement).value)}` : ""}`)} />
        </label>
      </div>
      <div className="card mt-4 overflow-hidden">
        {total === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{t("merchantPortal.customers.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">{t("merchantPortal.customers.thCustomer")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.customers.thEmail")}</th>
                    <th className="px-5 py-3 text-right">{t("merchantPortal.customers.thPayments")}</th>
                    <th className="px-5 py-3 text-right">{t("merchantPortal.customers.thTokens")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.customers.thLastPayment")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link href={`/merchant/customers/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {c.name ?? c.externalId}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{c.externalId}</p>
                        {c.anonymizedAt && <span className="badge mt-1 bg-slate-100 text-slate-600 ring-slate-200">{t("merchantPortal.customers.anonymized")}</span>}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{c.email ?? "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.paymentCount}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.tokenCount}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{c.lastPaymentAt ? formatDate(c.lastPaymentAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination basePath="/merchant/customers" params={{ q: q || undefined }} page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </div>
  );
}

export function MerchantCustomerDetailView({ customer }: { customer: CustomerDetail }) {
  const t = useT();
  const formatDate = useFormatDateTime();
  return (
    <div>
      <p className="text-xs">
        <Link href="/merchant/customers" className="text-brand-700 hover:underline">
          ← {t("merchantPortal.customers.back")}
        </Link>
      </p>
      <h1 className="mt-2 text-xl font-bold text-slate-900">{customer.name ?? customer.externalId}</h1>
      <p className="font-mono text-xs text-slate-500">{customer.externalId}</p>
      {customer.anonymizedAt && <p className="mt-2 text-xs text-slate-500">{t("merchantPortal.customers.anonymizedNote", { at: formatDate(customer.anonymizedAt) })}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5 text-sm">
          <h2 className="text-sm font-semibold text-slate-800">{t("merchantPortal.customers.profile")}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-slate-500">{t("merchantPortal.customers.thEmail")}</dt>
            <dd className="font-mono text-xs">{customer.email ?? "—"}</dd>
            <dt className="text-slate-500">{t("merchantPortal.customers.phone")}</dt>
            <dd className="font-mono text-xs">{customer.phone ?? "—"}</dd>
            <dt className="text-slate-500">{t("merchantPortal.customers.since")}</dt>
            <dd>{formatDate(customer.createdAt)}</dd>
          </dl>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="text-sm font-semibold text-slate-800">{t("merchantPortal.customers.tokens", { count: customer.tokens.length })}</h2>
          {customer.tokens.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">{t("merchantPortal.customers.noTokens")}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {customer.tokens.map((k) => (
                <li key={k.id} className="flex items-center justify-between">
                  <span>
                    <span className="font-medium uppercase">{k.brand}</span> <span className="font-mono text-xs">•••• {k.last4}</span> <span className="text-xs text-slate-500">{k.expiry}</span>
                  </span>
                  <span className="text-xs text-slate-500">{k.lastUsedAt ? formatDate(k.lastUsedAt) : formatDate(k.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="card mt-6">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.customers.payments", { count: customer.paymentCount })}</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {customer.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-5 py-3">
              <span>
                <Link href={`/merchant/transactions/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                  {p.orderNumber}
                </Link>
                <span className="ml-2 text-xs text-slate-500">{formatDate(p.createdAt)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums font-medium">{formatYen(p.amount)}</span>
                {isPaymentStatus(p.status) && <PaymentStatusBadge status={p.status} />}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
