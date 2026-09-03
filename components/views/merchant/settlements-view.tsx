"use client";

import Link from "next/link";
import { DetailRow } from "@/components/ui/detail-row";
import { SettlementStatusBadge } from "@/components/settlement-badges";
import { ModeBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { methodLabel } from "@/components/views/transactions-view";
import { isPaymentMethod } from "@/lib/payments/methods";
import type { SettlementLineRow, SettlementRow } from "@/lib/settlements/list";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

function usePeriod() {
  const formatDate = useFormatDateTime();
  return (b: { periodFrom: Date; periodTo: Date }) => `${formatDate(b.periodFrom).slice(0, 10)} – ${formatDate(new Date(b.periodTo.getTime() - 1)).slice(0, 10)}`;
}

export function MerchantSettlementsView({ rows }: { rows: SettlementRow[] }) {
  const t = useT();
  const formatDate = useFormatDateTime();
  const period = usePeriod();
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.settlements.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.settlements.description")}</p>
      <div className="card mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{t("merchantPortal.settlements.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("merchantPortal.settlements.thPeriod")}</th>
                  <th className="px-5 py-3 text-right">{t("merchantPortal.settlements.thGross")}</th>
                  <th className="px-5 py-3 text-right">{t("merchantPortal.settlements.thNet")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.settlements.thStatus")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.settlements.thScheduled")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <Link href={`/merchant/settlements/${b.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {period(b)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatYen(b.grossAmount)}</td>
                    <td className={cn("px-5 py-3 text-right tabular-nums font-semibold", b.netAmount < 0 && "text-rose-700")}>{formatYen(b.netAmount)}</td>
                    <td className="px-5 py-3">
                      <SettlementStatusBadge status={b.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{b.paidAt ? formatDate(b.paidAt).slice(0, 10) : b.scheduledAt ? formatDate(b.scheduledAt).slice(0, 10) : "—"}</td>
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

export function MerchantSettlementDetailView({ batch, lines }: { batch: SettlementRow; lines: SettlementLineRow[] }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const period = usePeriod();
  return (
    <div>
      <p className="text-xs">
        <Link href="/merchant/settlements" className="text-brand-700 hover:underline">
          ← {t("merchantPortal.settlements.back")}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.settlements.detailTitle", { period: period(batch) })}</h1>
        <ModeBadge live={batch.livemode} />
        <SettlementStatusBadge status={batch.status} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100">
            <h2 className="px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.settlements.sectionSummary")}</h2>
            <DetailRow label={t("settlements.gross")}>
              <span className="tabular-nums">{formatYen(batch.grossAmount)}</span>
            </DetailRow>
            <DetailRow label={t("settlements.fees")}>
              <span className="tabular-nums text-slate-600">−{formatYen(batch.feeAmount)}</span>
            </DetailRow>
            <DetailRow label={t("settlements.refunds")}>
              <span className="tabular-nums text-slate-600">−{formatYen(batch.refundAmount)}</span>
            </DetailRow>
            <DetailRow label={t("settlements.chargebacks")}>
              <span className="tabular-nums text-slate-600">−{formatYen(batch.chargebackAmount)}</span>
            </DetailRow>
            <DetailRow label={t("settlements.settlementFee")}>
              <span className="tabular-nums text-slate-600">−{formatYen(batch.settlementFee)}</span>
            </DetailRow>
            <DetailRow label={t("settlements.net")}>
              <span className={cn("text-lg font-semibold tabular-nums", batch.netAmount < 0 && "text-rose-700")}>{formatYen(batch.netAmount)}</span>
            </DetailRow>
            <DetailRow label={t("merchantPortal.settlements.thScheduled")}>{batch.scheduledAt ? formatDate(batch.scheduledAt).slice(0, 10) : "—"}</DetailRow>
            <DetailRow label={t("settlements.paidAt")}>{batch.paidAt ? formatDate(batch.paidAt) : "—"}</DetailRow>
          </section>
          <section className="card overflow-hidden">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.settlements.sectionLines", { count: lines.length })}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2">{t("settlements.thOccurred")}</th>
                    <th className="px-5 py-2">{t("settlements.thKind")}</th>
                    <th className="px-5 py-2">{t("settlements.thOrder")}</th>
                    <th className="px-5 py-2">{t("settlements.thMethod")}</th>
                    <th className="px-5 py-2 text-right">{t("settlements.thAmount")}</th>
                    <th className="px-5 py-2 text-right">{t("settlements.thFee")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-5 py-2 text-xs text-slate-600">{formatDate(l.occurredAt)}</td>
                      <td className="px-5 py-2">{t(`settlementEnums.lineKind.${l.kind}` as MessageKey)}</td>
                      <td className="px-5 py-2">{l.paymentId ? <Link href={`/merchant/transactions/${l.paymentId}`} className="text-brand-700 hover:underline">{l.description ?? l.paymentId}</Link> : (l.description ?? "—")}</td>
                      <td className="px-5 py-2 text-slate-600">{isPaymentMethod(l.method) ? methodLabel(l.method, lang) : (l.method ?? "—")}</td>
                      <td className={cn("px-5 py-2 text-right tabular-nums", l.amount < 0 && "text-rose-700")}>{formatYen(l.amount)}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-slate-600">{l.fee ? `−${formatYen(l.fee)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <aside>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("merchantPortal.settlements.invoicePdf")}</p>
            <p className="mt-1">{batch.status === "collecting" ? t("merchantPortal.settlements.invoiceCollecting") : t("merchantPortal.settlements.invoiceHelp")}</p>
            {batch.status !== "collecting" && (
              <a href={`/api/merchant-portal/settlements/${batch.id}/invoice`} target="_blank" rel="noopener" className="btn-secondary mt-3 inline-flex w-full justify-center">
                {t("merchantPortal.settlements.invoicePdf")}
              </a>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
