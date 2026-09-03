"use client";

import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { RefundStatusBadge } from "@/components/refund-badges";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { RefundRow } from "@/lib/refunds/list";
import { formatYen } from "@/lib/utils";

export function MerchantRefundsView({ rows, total, page, pageSize }: { rows: RefundRow[]; total: number; page: number; pageSize: number }) {
  const t = useT();
  const formatDate = useFormatDateTime();
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.refunds.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.refunds.description")}</p>
      <div className="card mt-4 overflow-hidden">
        {total === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{t("merchantPortal.refunds.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">{t("merchantPortal.refunds.thAt")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.refunds.thOrder")}</th>
                    <th className="px-5 py-3 text-right">{t("merchantPortal.refunds.thAmount")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.refunds.thReason")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.refunds.thStatus")}</th>
                    <th className="px-5 py-3">{t("merchantPortal.refunds.thCompleted")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-3">
                        <Link href={`/merchant/transactions/${r.paymentId}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {r.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-purple-700">−{formatYen(r.amount)}</td>
                      <td className="px-5 py-3 text-slate-700">
                        {t(`refundEnums.reason.${r.reasonCode}`)}
                        {r.reason && <p className="text-xs text-slate-500">{r.reason}</p>}
                        {r.decisionNote && r.status === "rejected" && <p className="text-xs text-rose-700">{r.decisionNote}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <RefundStatusBadge status={r.status} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{r.completedAt ? formatDate(r.completedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination basePath="/merchant/refunds" params={{}} page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </div>
  );
}
