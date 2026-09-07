"use client";

// Merchant-side transaction detail (Phase L-2): the transaction, its bank /
// konbini instructions, refunds and a refund request form. No internal notes,
// no operator actions.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DetailRow } from "@/components/ui/detail-row";
import { useConfirm } from "@/components/confirm-dialog";
import { RecipientField } from "@/components/receipt-card";
import { RECEIPT_STATUSES } from "@/lib/receipts/statuses";
import { ModeBadge, PaymentStatusBadge } from "@/components/payment-status-badge";
import { RefundStatusBadge } from "@/components/refund-badges";
import { useApiJson, useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { methodLabel } from "@/components/views/transactions-view";
import { formatCvsReceiptNo, isCvsBrand } from "@/lib/payments/konbini";
import type { PaymentMethod } from "@/lib/payments/methods";
import type { PaymentStatus } from "@/lib/payments/transitions";
import type { RefundItem } from "@/lib/payments/detail";
import { REFUND_REASONS, isRefundReason, isRefundStatus, type RefundReason } from "@/lib/refunds/types";
import type { MessageKey } from "@/lib/i18n";
import { popFlash, pushFlash } from "@/lib/flash";
import { cn, formatYen } from "@/lib/utils";

export interface MerchantTransaction {
  id: string;
  orderNumber: string;
  amount: number;
  amountRefunded: number;
  pendingRefundAmount: number;
  status: PaymentStatus;
  livemode: boolean;
  method: PaymentMethod;
  productName: string | null;
  customerName: string | null;
  customerId: string | null;
  customerEmail: string | null;
  createdAt: Date;
  capturedAt: Date | null;
  failureReason: string | null;
  transferId: string | null;
  transferDueAt: Date | null;
  depositAmount: number | null;
  cvsBrand: string | null;
  cvsReceiptNo: string | null;
  cvsPaidAt: Date | null;
  refundDeadlineAt: Date | null;
  overdue: boolean;
  events: Array<{ id: string; type: string; toStatus: string | null; amount: number | null; createdAt: Date }>;
  refunds: RefundItem[];
  /** Receipt shared with the operator dashboard (Phase P3-8). */
  receipt: { receiptNo: string; recipientName: string; description: string | null; reissueCount: number; lastIssuedAt: Date; source: string } | null;
}

export function MerchantTransactionDetailView({ payment }: { payment: MerchantTransaction }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const apiJson = useApiJson();
  const formatDate = useFormatDateTime();
  const refundable = payment.status === "captured" || payment.status === "partially_refunded";
  const remaining = payment.amount - payment.amountRefunded - payment.pendingRefundAmount;
  const deadlinePassed = payment.refundDeadlineAt !== null && payment.refundDeadlineAt.getTime() < Date.now();
  const [amount, setAmount] = useState(String(Math.max(0, remaining)));
  const [reasonCode, setReasonCode] = useState<RefundReason>("customer");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => popFlash(`merchant:refund:${payment.id}`) ?? null);

  async function requestRefund(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiJson("/api/merchant-portal/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId: payment.id, amount: Number(amount), reasonCode, reason }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setNotice(t("merchantPortal.transactions.refundRequested"));
    pushFlash(`merchant:refund:${payment.id}`, t("merchantPortal.transactions.refundRequested"));
    router.refresh();
  }

  return (
    <div>
      <p className="text-xs">
        <Link href="/merchant/transactions" className="text-brand-700 hover:underline">
          ← {t("merchantPortal.transactions.back")}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.transactions.detailTitle", { orderNumber: payment.orderNumber })}</h1>
        <ModeBadge live={payment.livemode} />
        <PaymentStatusBadge status={payment.status} />
        {payment.overdue && <span className="badge bg-rose-600 text-white ring-rose-700">{t("transactions.overdue")}</span>}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100">
            <h2 className="px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.transactions.sectionInfo")}</h2>
            <DetailRow label={t("merchantPortal.transactions.transactionId")}>
              <span className="font-mono text-xs">{payment.id}</span>
            </DetailRow>
            <DetailRow label={t("merchantPortal.transactions.amount")}>
              <span className="text-lg font-semibold tabular-nums">{formatYen(payment.amount)}</span>
            </DetailRow>
            {payment.amountRefunded > 0 && (
              <DetailRow label={t("merchantPortal.transactions.amountRefunded")}>
                <span className="tabular-nums text-purple-700">−{formatYen(payment.amountRefunded)}</span>
              </DetailRow>
            )}
            <DetailRow label={t("merchantPortal.transactions.product")}>{payment.productName ?? "—"}</DetailRow>
            <DetailRow label={t("merchantPortal.transactions.customer")}>
              <div>
                {payment.customerName ?? "—"}
                {payment.customerId && <p className="font-mono text-xs text-slate-500">{payment.customerId}</p>}
                {payment.customerEmail && <p className="text-xs text-slate-500">{payment.customerEmail}</p>}
              </div>
            </DetailRow>
            <DetailRow label={t("merchantPortal.transactions.method")}>{methodLabel(payment.method, lang)}</DetailRow>
            <DetailRow label={t("merchantPortal.transactions.createdAt")}>{formatDate(payment.createdAt)}</DetailRow>
            <DetailRow label={t("merchantPortal.transactions.completedAt")}>{payment.capturedAt ? formatDate(payment.capturedAt) : "—"}</DetailRow>
            {payment.failureReason && (
              <DetailRow label={t("merchantPortal.transactions.failureReason")}>
                <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{payment.failureReason}</span>
              </DetailRow>
            )}
          </section>
          {payment.transferId && (
            <section className={cn("card divide-y divide-slate-100", payment.overdue && "border-rose-300")}>
              <h2 className="px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.transactions.bankTransfer")}</h2>
              <DetailRow label={t("merchantPortal.transactions.transferId")}>
                <span className="font-mono text-base font-semibold tracking-wider">{payment.transferId}</span>
              </DetailRow>
              <DetailRow label={t("merchantPortal.transactions.dueAt")}>{payment.transferDueAt ? formatDate(payment.transferDueAt) : "—"}</DetailRow>
              <DetailRow label={t("paymentDetail.depositAmount")}>{payment.depositAmount != null ? formatYen(payment.depositAmount) : "—"}</DetailRow>
            </section>
          )}
          {payment.cvsReceiptNo && (
            <section className={cn("card divide-y divide-slate-100", payment.overdue && "border-rose-300")}>
              <h2 className="px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.transactions.konbini")}</h2>
              <DetailRow label={t("paymentDetail.cvsBrand")}>{isCvsBrand(payment.cvsBrand) ? t(`cvsEnums.brand.${payment.cvsBrand}`) : "—"}</DetailRow>
              <DetailRow label={t("merchantPortal.transactions.receiptNo")}>
                <span className="font-mono text-base font-semibold tracking-wider">{formatCvsReceiptNo(payment.cvsReceiptNo)}</span>
              </DetailRow>
              <DetailRow label={t("merchantPortal.transactions.dueAt")}>{payment.transferDueAt ? formatDate(payment.transferDueAt) : "—"}</DetailRow>
              <DetailRow label={t("paymentDetail.cvsPaidAt")}>{payment.cvsPaidAt ? formatDate(payment.cvsPaidAt) : t("paymentDetail.cvsUnpaid")}</DetailRow>
            </section>
          )}
          <section className="card">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.transactions.events")}</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {payment.events.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-5 py-2">
                  <span>
                    <span className="font-medium text-slate-800">{e.type}</span>
                    {e.toStatus && <span className="ml-2 text-xs text-slate-500">→ {t(`status.${e.toStatus}` as MessageKey)}</span>}
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{t("merchantPortal.transactions.refundsTitle")}</h2>
            {payment.refunds.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">{t("merchantPortal.transactions.noRefunds")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {payment.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-3">
                    <span>
                      {isRefundReason(r.reasonCode) ? t(`refundEnums.reason.${r.reasonCode}`) : r.reasonCode}
                      <span className="ml-2 text-xs text-slate-500">{formatDate(r.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-purple-700">−{formatYen(r.amount)}</span>
                      {isRefundStatus(r.status) && <RefundStatusBadge status={r.status} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <MerchantReceiptCard payment={payment} />
          <form onSubmit={requestRefund} className="card space-y-3 p-4" aria-busy={busy}>
            <p className="text-sm font-semibold text-slate-800">{t("merchantPortal.transactions.requestRefund")}</p>
            <p className="text-xs text-slate-500">{t("merchantPortal.transactions.requestRefundHelp")}</p>
            {!refundable ? (
              <p className="text-xs text-slate-500">{t("merchantPortal.transactions.notRefundable")}</p>
            ) : (
              <>
                <div>
                  <label htmlFor="mp-refund-amount" className="label">
                    {t("merchantPortal.transactions.refundAmount")}
                  </label>
                  <input id="mp-refund-amount" type="number" min={1} max={remaining} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                  <p className="help">{t("merchantPortal.transactions.refundRemaining", { remaining: formatYen(remaining) })}</p>
                </div>
                <div>
                  <label htmlFor="mp-refund-reason-code" className="label">
                    {t("merchantPortal.transactions.refundReasonCode")}
                  </label>
                  <select id="mp-refund-reason-code" className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as RefundReason)}>
                    {REFUND_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`refundEnums.reason.${r}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="mp-refund-reason" className="label">
                    {t("merchantPortal.transactions.refundReason")}
                  </label>
                  <input id="mp-refund-reason" className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} required={reasonCode === "other"} />
                </div>
                <button type="submit" className="btn-danger w-full" disabled={busy || remaining <= 0 || deadlinePassed}>
                  {busy ? t("common.processing") : t("merchantPortal.transactions.requestRefund")}
                </button>
                {deadlinePassed && <p className="text-xs text-rose-700">{t("paymentActions.refundDeadlinePassed")}</p>}
              </>
            )}
            {notice && (
              <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
          </form>
        </aside>
      </div>
    </div>
  );
}

/** Receipt issue / re-issue from the merchant portal (Phase P3-8): completed transactions only, addressee and 但し書き editable. */
function MerchantReceiptCard({ payment }: { payment: MerchantTransaction }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const formatDate = useFormatDateTime();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fieldsRef = useRef<{ name: string; description: string }>({ name: "", description: "" });
  const receipt = payment.receipt;
  const eligible = RECEIPT_STATUSES.includes(payment.status);
  if (!eligible && !receipt) return null;

  async function issue() {
    setError(null);
    setNotice(null);
    fieldsRef.current = { name: receipt?.recipientName ?? payment.customerName ?? "", description: receipt?.description ?? "" };
    const ok = await confirm({
      title: receipt ? t("merchantPortal.receipt.reissue") : t("merchantPortal.receipt.issue"),
      body: t("merchantPortal.receipt.body"),
      confirmLabel: receipt ? t("merchantPortal.receipt.reissue") : t("merchantPortal.receipt.issue"),
      fields: <RecipientField valueRef={fieldsRef} />,
    });
    if (!ok) return;
    setBusy(true);
    const res = await apiJson<{ receiptNo: string }>(`/api/merchant-portal/receipts/${payment.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipientName: fieldsRef.current.name, description: fieldsRef.current.description }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setNotice(t("merchantPortal.receipt.issued", { no: res.data.receiptNo }));
    router.refresh();
  }

  return (
    <div className="card p-4 text-xs text-slate-600" aria-busy={busy} data-testid="merchant-receipt">
      <p className="text-sm font-semibold text-slate-800">{t("merchantPortal.receipt.title")}</p>
      {receipt ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">{t("paymentDetail.receiptNo")}</dt>
          <dd className="font-mono">{receipt.receiptNo}</dd>
          <dt className="text-slate-500">{t("paymentDetail.receiptRecipient")}</dt>
          <dd>{receipt.recipientName || "—"}</dd>
          {receipt.description && (
            <>
              <dt className="text-slate-500">{t("paymentDetail.receiptDescription")}</dt>
              <dd>{receipt.description}</dd>
            </>
          )}
          <dt className="text-slate-500">{t("paymentDetail.receiptIssuedAt")}</dt>
          <dd>
            {formatDate(receipt.lastIssuedAt)}
            {receipt.reissueCount > 0 && <span className="ml-1 text-amber-700">({t("paymentDetail.receiptReissueCount", { count: receipt.reissueCount })})</span>}
          </dd>
        </dl>
      ) : (
        <p className="mt-1">{t("merchantPortal.receipt.body")}</p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {receipt && (
          <a href={`/api/merchant-portal/receipts/${payment.id}`} target="_blank" rel="noopener" className="btn-secondary inline-flex w-full justify-center">
            {t("paymentDetail.receiptDownload")}
          </a>
        )}
        {eligible && (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={issue}>
            {busy ? t("common.processing") : receipt ? t("merchantPortal.receipt.reissue") : t("merchantPortal.receipt.issue")}
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
          {error}
        </p>
      )}
    </div>
  );
}
