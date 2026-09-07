"use client";

// Receipt card on the transaction detail (Phase K-2): issue / re-issue with
// an editable addressee (permission receipt.issue) and open the PDF.

import { useRouter } from "next/navigation";
import { useEffect, useState, type MutableRefObject } from "react";
import { useRef } from "react";
import { useApiJson, useFormatDateTime, useT } from "./language-provider";
import { useConfirm } from "./confirm-dialog";
import { useCan } from "./session-provider";
import type { TransactionDetail } from "@/lib/payments/detail";
import { RECEIPT_STATUSES } from "@/lib/receipts/statuses";

export function ReceiptCard({ paymentId, status, receipt, customerName }: { paymentId: string; status: string; receipt: TransactionDetail["receipt"]; customerName: string | null }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const { confirm } = useConfirm();
  const canIssue = useCan("receipt", "issue");
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nameRef = useRef<{ name: string; description: string }>({ name: "", description: "" });
  const eligible = RECEIPT_STATUSES.includes(status);

  async function issue() {
    setError(null);
    setNotice(null);
    nameRef.current = { name: receipt?.recipientName ?? customerName ?? "", description: receipt?.description ?? "" };
    const ok = await confirm({
      title: receipt ? t("paymentDetail.receiptReissue") : t("paymentDetail.receiptIssue"),
      body: t("paymentDetail.receiptBody"),
      confirmLabel: receipt ? t("paymentDetail.receiptReissue") : t("paymentDetail.receiptIssue"),
      fields: <RecipientField valueRef={nameRef} />,
    });
    if (!ok) return;
    setBusy(true);
    const res = await apiJson<{ receiptNo: string }>(`/api/payments/${paymentId}/receipt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipientName: nameRef.current.name, description: nameRef.current.description }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setNotice(t("paymentDetail.receiptIssued", { no: res.data.receiptNo }));
    router.refresh();
  }

  if (!eligible && !receipt) return null;
  return (
    <div className="card p-4 text-xs text-slate-600" aria-busy={busy}>
      <p className="font-semibold text-slate-800">{t("paymentDetail.receiptTitle")}</p>
      {receipt ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">{t("paymentDetail.receiptNo")}</dt>
          <dd className="font-mono">{receipt.receiptNo}</dd>
          <dt className="text-slate-500">{t("paymentDetail.receiptRecipient")}</dt>
          <dd>{receipt.recipientName || "—"}</dd>
          <dt className="text-slate-500">{t("paymentDetail.receiptIssuedAt")}</dt>
          <dd>
            {formatDate(receipt.lastIssuedAt)}
            {receipt.reissueCount > 0 && <span className="ml-1 text-amber-700">({t("paymentDetail.receiptReissueCount", { count: receipt.reissueCount })})</span>}
          </dd>
          {receipt.description && (
            <>
              <dt className="text-slate-500">{t("paymentDetail.receiptDescription")}</dt>
              <dd>{receipt.description}</dd>
            </>
          )}
          {receipt.source === "customer" && <dd className="col-span-2 text-slate-500">{t("paymentDetail.receiptSourceCustomer")}</dd>}
          {receipt.source === "merchant" && <dd className="col-span-2 text-slate-500">{t("paymentDetail.receiptSourceMerchant")}</dd>}
        </dl>
      ) : (
        <p className="mt-1">{t("paymentDetail.receiptBody")}</p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {receipt && (
          <a href={`/api/payments/${paymentId}/receipt`} target="_blank" rel="noopener" className="btn-secondary inline-flex w-full justify-center">
            {t("paymentDetail.receiptDownload")}
          </a>
        )}
        {eligible && (
          <button type="button" className="btn-primary w-full" disabled={!canIssue || busy} onClick={issue}>
            {busy ? t("common.processing") : receipt ? t("paymentDetail.receiptReissue") : t("paymentDetail.receiptIssue")}
          </button>
        )}
        {!canIssue && eligible && <p className="text-[11px] text-slate-400">{t("paymentDetail.receiptPermission")}</p>}
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

export function RecipientField({ valueRef }: { valueRef: MutableRefObject<{ name: string; description: string }> }) {
  const t = useT();
  const [name, setName] = useState(valueRef.current.name);
  const [description, setDescription] = useState(valueRef.current.description);
  useEffect(() => {
    valueRef.current = { name, description };
  }, [name, description, valueRef]);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="receipt-recipient" className="label">
          {t("paymentDetail.receiptRecipient")}
        </label>
        <input id="receipt-recipient" className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <p className="help">{t("paymentDetail.receiptRecipientHelp")}</p>
      </div>
      <div>
        <label htmlFor="receipt-description" className="label">
          {t("paymentDetail.receiptDescription")}
        </label>
        <input id="receipt-description" className="input" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} />
        <p className="help">{t("paymentDetail.receiptDescriptionHelp")}</p>
      </div>
    </div>
  );
}
