"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { methodLabel } from "@/components/views/transactions-view";
import type { TransactionListItem } from "@/lib/payments/list";
import { PAYMENT_STATUSES, type PaymentStatus } from "@/lib/payments/transitions";
import { formatYen } from "@/lib/utils";

export function MerchantTransactionsView({ items, total, page, pageSize, status }: { items: TransactionListItem[]; total: number; page: number; pageSize: number; status: PaymentStatus | "" }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params = { status: status || undefined };
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.transactions.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.transactions.description")}</p>
      <div className="mt-4 flex items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("merchantPortal.transactions.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={status} onChange={(e) => router.push(e.target.value ? `/merchant/transactions?status=${e.target.value}` : "/merchant/transactions")}>
            <option value="">{t("common.modeAll")}</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="card mt-4 overflow-hidden">
        {total === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{t("merchantPortal.transactions.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">{t("merchantPortal.transactions.thOrder")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.transactions.thCustomer")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.transactions.thMethod")}</th>
                    <th className="px-5 py-3 text-right">{t("merchantPortal.transactions.thAmount")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.transactions.thStatus")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.transactions.thCreated")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link href={`/merchant/transactions/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {p.orderNumber}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{p.id}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {p.customerName ?? "—"}
                        {p.customerId && <p className="font-mono text-xs text-slate-500">{p.customerId}</p>}
                      </td>
                      <td className="px-5 py-3 text-slate-700">{methodLabel(p.method, lang)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">
                        {formatYen(p.amount)}
                        {p.amountRefunded > 0 && <p className="text-xs font-normal text-purple-700">−{formatYen(p.amountRefunded)}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <PaymentStatusBadge status={p.status} />
                        {p.overdue && <span className="badge ml-1 bg-rose-600 text-white ring-rose-700">{t("transactions.overdue")}</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination basePath="/merchant/transactions" params={params} page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </div>
  );
}
