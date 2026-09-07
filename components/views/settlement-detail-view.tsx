"use client";

// Settlement batch detail: breakdown, master transitions (confirm →
// scheduled → paid, hold / release) and the line table with CSV export.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { SettlementStatusBadge } from "@/components/settlement-badges";
import { ModeBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useCan } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { methodLabel } from "@/components/views/transactions-view";
import type { SettlementLineRow, SettlementRow } from "@/lib/settlements/list";
import { SETTLEMENT_TRANSITIONS, type SettlementAction, type TaxRounding } from "@/lib/settlements/types";
import { invoiceItems, summarizeTax } from "@/lib/settlements/tax";
import { isPaymentMethod } from "@/lib/payments/methods";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

export function SettlementDetailView({ batch, lines, taxRounding = "floor" }: { batch: SettlementRow; lines: SettlementLineRow[]; taxRounding?: TaxRounding }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isMaster = useCan("settlement", "transition");
  const canInvoice = useCan("invoice", "export");
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<{ reason: string }>({ reason: "" });
  const period = `${formatDate(batch.periodFrom).slice(0, 10)} – ${formatDate(new Date(batch.periodTo.getTime() - 1)).slice(0, 10)}`;

  const actions = (Object.keys(SETTLEMENT_TRANSITIONS) as SettlementAction[]).filter((a) => SETTLEMENT_TRANSITIONS[a].from.includes(batch.status));

  async function run(action: SettlementAction) {
    reasonRef.current = { reason: "" };
    const ok = await confirm({
      title: t(`settlements.actions.${action}` as MessageKey),
      body: t(`settlements.confirm.${action}` as MessageKey, { net: formatYen(batch.netAmount), merchant: batch.merchant.siteName }),
      confirmLabel: t(`settlements.actions.${action}` as MessageKey),
      tone: action === "hold" ? "danger" : "primary",
      fields: action === "hold" ? <ReasonField valueRef={reasonRef} /> : undefined,
      confirmDisabled: action === "hold",
    });
    if (!ok) return;
    setBusy(action);
    setError(null);
    const res = await apiJson(`/api/settlements/${batch.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "hold" ? { reason: reasonRef.current.reason } : {}),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t(`settlements.done.${action}` as MessageKey));
    router.refresh();
  }

  async function discard() {
    const ok = await confirm({ title: t("settlements.discard"), body: t("settlements.discardBody"), confirmLabel: t("settlements.discard"), tone: "danger" });
    if (!ok) return;
    setBusy("delete");
    const res = await apiJson(`/api/settlements/${batch.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("settlements.discarded"));
    router.push("/settlements");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={t("settlements.detailTitle", { merchant: batch.merchant.siteName })}
        description={period}
        helpHref="/manual/settlements"
        breadcrumbs={[{ label: t("settlements.title"), href: "/settlements" }, { label: batch.merchant.merchantCode }]}
        actions={
          <>
            <ModeBadge live={batch.livemode} />
            <SettlementStatusBadge status={batch.status} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="batch-heading">
            <h2 id="batch-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("settlements.sectionSummary")}
            </h2>
            <DetailRow label={t("settlements.thMerchant")}>
              <Link href={`/merchants/${batch.merchant.id}?tab=settlement`} className="text-brand-700 hover:underline">
                {batch.merchant.merchantCode} — {batch.merchant.siteName}
              </Link>
            </DetailRow>
            <DetailRow label={t("settlements.thPeriod")}>{period}</DetailRow>
            <DetailRow label={t("settlements.invoiceNo")}>{batch.invoiceNo ? <span className="font-mono">{batch.invoiceNo}</span> : <span className="text-slate-400">{t("settlements.invoiceNoPending")}</span>}</DetailRow>
            <DetailRow label={t("settlements.gross")}>
              <span className="tabular-nums">{formatYen(batch.grossAmount)}</span>
            </DetailRow>
            <DetailRow label={t("settlements.fees")}>
              <span className="tabular-nums text-slate-600">−{formatYen(batch.feeAmount)}</span>
            </DetailRow>
            <DetailRow label={t("settlements.taxBreakdown")}>
              <TaxBreakdown lines={lines} settlementFee={batch.settlementFee} rounding={taxRounding} />
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
            <DetailRow label={t("settlements.thScheduled")}>{batch.scheduledAt ? formatDate(batch.scheduledAt).slice(0, 10) : "—"}</DetailRow>
            <DetailRow label={t("settlements.paidAt")}>{batch.paidAt ? formatDate(batch.paidAt) : "—"}</DetailRow>
            {batch.holdReason && (
              <DetailRow label={t("settlements.holdReason")}>
                <span className="text-rose-700">{batch.holdReason}</span>
              </DetailRow>
            )}
            <DetailRow label={t("settlements.createdAt")}>{formatDate(batch.createdAt)}</DetailRow>
          </section>

          <section className="card overflow-hidden" aria-labelledby="lines-heading">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 id="lines-heading" className="text-sm font-semibold text-slate-800">
                {t("settlements.sectionLines", { count: lines.length })}
              </h2>
              {lines.length > 0 && (
                <a href={`/api/settlements/${batch.id}/lines?format=csv`} download className="text-xs font-medium text-brand-700 hover:underline">
                  {t("settlements.linesCsv")}
                </a>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{t("settlements.noLines")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-2">{t("settlements.thOccurred")}</th>
                      <th className="px-5 py-2">{t("settlements.thKind")}</th>
                      <th className="px-5 py-2">{t("settlements.thOrder")}</th>
                      <th className="px-5 py-2">{t("settlements.thMethod")}</th>
                      <th className="px-5 py-2 text-right">{t("settlements.thAmount")}</th>
                      <th className="px-5 py-2 text-right">{t("settlements.thFee")}</th>
                      <th className="px-5 py-2">{t("settlements.thTaxCategory")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap px-5 py-2 text-xs text-slate-600">{formatDate(l.occurredAt)}</td>
                        <td className="px-5 py-2">{t(`settlementEnums.lineKind.${l.kind}` as MessageKey)}</td>
                        <td className="px-5 py-2">
                          {l.paymentId ? (
                            <Link href={`/payments/${l.paymentId}`} className="text-brand-700 hover:underline">
                              {l.orderNumber ?? l.description ?? l.paymentId}
                            </Link>
                          ) : (
                            l.description ?? "—"
                          )}
                        </td>
                        <td className="px-5 py-2 text-slate-600">{isPaymentMethod(l.method) ? methodLabel(l.method, lang) : l.method ?? "—"}</td>
                        <td className={cn("px-5 py-2 text-right tabular-nums", l.amount < 0 && "text-rose-700")}>{formatYen(l.amount)}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-slate-600">{l.fee ? `−${formatYen(l.fee)}` : "—"}</td>
                        <td className="px-5 py-2 text-xs text-slate-500">{l.fee ? t(`settlementEnums.taxCategory.${l.taxCategory}` as MessageKey) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3 space-y-2" aria-busy={busy !== null}>
              {actions.map((a) => (
                <button key={a} type="button" className={cn("w-full", a === "hold" ? "btn-danger" : a === "release" ? "btn-secondary" : "btn-primary")} disabled={!isMaster || busy !== null} onClick={() => run(a)}>
                  {busy === a ? t("common.processing") : t(`settlements.actions.${a}` as MessageKey)}
                </button>
              ))}
              {batch.status === "collecting" && (
                <button type="button" className="btn-secondary w-full" disabled={!isMaster || busy !== null} onClick={discard}>
                  {t("settlements.discard")}
                </button>
              )}
              {actions.length === 0 && batch.status !== "collecting" && <p className="text-xs text-slate-500">{t("settlements.noActions")}</p>}
              {!isMaster && actions.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("settlements.masterOnly")}</p>}
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("settlements.invoicePdf")}</p>
            <p className="mt-1">{batch.status === "collecting" ? t("settlements.invoiceCollecting") : t("settlements.invoiceHelp")}</p>
            {batch.status !== "collecting" && canInvoice && (
              <a href={`/api/settlements/${batch.id}/invoice`} target="_blank" rel="noopener" className="btn-secondary mt-3 inline-flex w-full justify-center">
                {t("settlements.invoicePdf")}
              </a>
            )}
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("settlements.flowTitle")}</p>
            <p className="mt-1">{t("settlements.flowBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReasonField({ valueRef }: { valueRef: MutableRefObject<{ reason: string }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [reason, setReason] = useState("");
  useEffect(() => {
    valueRef.current = { reason };
    update({ confirmDisabled: reason.trim().length === 0 });
  }, [reason, update, valueRef]);
  return (
    <div>
      <label htmlFor="hold-reason" className="label">
        {t("settlements.holdReason")}
      </label>
      <input id="hold-reason" className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
    </div>
  );
}

/** Per-rate breakdown of the tax-inclusive fees (Phase P3-5) — the same items and rounding as the invoice PDF. */
function TaxBreakdown({ lines, settlementFee, rounding }: { lines: SettlementLineRow[]; settlementFee: number; rounding: TaxRounding }) {
  const t = useT();
  const items = invoiceItems(lines, settlementFee);
  const rows = summarizeTax(
    items.map((i) => ({ taxCategory: i.taxCategory, amount: i.fee })),
    rounding,
  );
  if (rows.length === 0) return <span className="text-slate-400">—</span>;
  const total = rows.reduce((s, r) => s + r.inclusive, 0);
  const tax = rows.reduce((s, r) => s + r.tax, 0);
  return (
    <div className="text-xs" data-testid="tax-breakdown">
      <table className="w-full max-w-md text-left">
        <thead className="text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 pr-3">{t("settlements.taxRate")}</th>
            <th className="py-1 pr-3 text-right">{t("settlements.taxExclusive")}</th>
            <th className="py-1 pr-3 text-right">{t("settlements.taxAmount")}</th>
            <th className="py-1 text-right">{t("settlements.taxInclusive")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category}>
              <td className="py-1 pr-3">{t(`settlementEnums.taxCategory.${r.category}` as MessageKey)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatYen(r.exclusive)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatYen(r.tax)}</td>
              <td className="py-1 text-right tabular-nums">{formatYen(r.inclusive)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 font-semibold">
            <td className="py-1 pr-3">{t("settlements.taxTotal")}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatYen(total - tax)}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatYen(tax)}</td>
            <td className="py-1 text-right tabular-nums">{formatYen(total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-slate-500">{t("settlements.taxNote", { rounding: t(`globalSettings.rounding.${rounding}` as MessageKey) })}</p>
    </div>
  );
}
