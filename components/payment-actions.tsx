"use client";

// Action buttons for a transaction. Which buttons exist follows the state
// machine (lib/payments/transitions.ts); whether they are enabled also
// follows the role: application-stage actions need "master" (the server
// enforces this too — the UI only mirrors it).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useApiJson, useFormatDateTime, useT } from "./language-provider";
import { useConfirm } from "./confirm-dialog";
import { useRole } from "./session-provider";
import { formatYen } from "@/lib/utils";
import { canTransition, type PaymentAction, type PaymentStatus } from "@/lib/payments/transitions";
import type { TransactionDetail } from "@/lib/payments/detail";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@/lib/webhooks/events";
import { popFlash, pushFlash } from "@/lib/flash";
import { REFUND_REASONS, type RefundReason } from "@/lib/refunds/types";
import type { MessageKey } from "@/lib/i18n";

export function PaymentActions({ payment }: { payment: TransactionDetail }) {
  const { id, orderNumber, status, amount, amountRefunded } = payment;
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const { confirm } = useConfirm();
  const { can } = useRole();
  const canState = can("payment", "state");
  const canDeposit = can("payment", "deposit");
  const canRequestRefund = can("refund", "request");
  const canForceRefund = can("refund", "force");
  const canRenotify = can("payment", "renotify");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Survives the remount that router.refresh() can cause (see lib/flash.ts).
  const [notice, setNotice] = useState<string | null>(() => popFlash(`payment:${id}`) ?? null);
  const refundRef = useRef<{ amount: number; reasonCode: RefundReason; reason: string; force: boolean }>({ amount: 0, reasonCode: "customer", reason: "", force: false });
  const depositRef = useRef<{ amount: number }>({ amount: 0 });
  const formatDate = useFormatDateTime();

  const isBank = payment.transferId !== null;
  // Refundable balance minus requests still waiting for a decision.
  const remaining = amount - amountRefunded - payment.pendingRefundAmount;
  const deadlinePassed = payment.refundDeadlineAt !== null && payment.refundDeadlineAt.getTime() < Date.now();
  const deposited = payment.depositAmount ?? 0;
  const outstanding = Math.max(0, amount - deposited);

  // Which actions this screen offers, in display order.
  const offered: PaymentAction[] = isBank ? ["deposit", "expire", "cancel", "refund"] : ["capture", "fail", "cancel", "refund"];
  const possible = (a: PaymentAction) =>
    canTransition(status, a) && (a !== "expire" || payment.overdue) && (a !== "refund" || (remaining > 0 && (!deadlinePassed || canForceRefund)));
  const permitted = (a: PaymentAction) => (a === "refund" ? canRequestRefund : a === "deposit" ? canDeposit : canState);
  const allowed = (a: PaymentAction) => possible(a) && permitted(a);
  const anyPossible = offered.some(possible);
  const needsMaster = offered.some((a) => possible(a) && !permitted(a));
  // API 再通知 (bank transfers only): re-send payment.completed to the merchant once the transfer is completed.
  const renotifyPossible = isBank && payment.merchant !== null && (status === "captured" || status === "partially_refunded" || status === "refunded");
  const renotifyAllowed = renotifyPossible && canRenotify;

  async function renotify() {
    setError(null);
    setNotice(null);
    const ok = await confirm({
      title: t("paymentActions.renotify"),
      body: t("paymentActions.confirmRenotifyBody", { orderNumber, transferId: payment.transferId ?? "", merchant: payment.merchant?.siteName ?? "" }),
      confirmLabel: t("paymentActions.renotify"),
    });
    if (!ok) return;
    setBusy("renotify");
    const res = await apiJson<{ deliveryId: string | null; renotifyCount: number }>(`/api/payments/${id}/renotify`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const message = res.data.deliveryId ? t("paymentActions.renotified", { count: res.data.renotifyCount }) : t("paymentActions.renotifiedNoUrl");
    setNotice(message);
    pushFlash(`payment:${id}`, message);
    router.refresh();
  }

  async function run(action: PaymentAction) {
    setError(null);
    setNotice(null);
    let body: Record<string, unknown> | undefined;

    if (action === "cancel") {
      const ok = await confirm({
        title: t("paymentActions.cancel"),
        body: t("paymentActions.confirmCancelBody", { orderNumber, amount: formatYen(amount) }),
        confirmLabel: t("paymentActions.cancel"),
        tone: "danger",
      });
      if (!ok) return;
    } else if (action === "fail") {
      const ok = await confirm({
        title: t("paymentActions.fail"),
        body: t("paymentActions.confirmFailBody", { orderNumber }),
        confirmLabel: t("paymentActions.fail"),
        tone: "danger",
      });
      if (!ok) return;
    } else if (action === "expire") {
      const ok = await confirm({
        title: t("paymentActions.expire"),
        body: t("paymentActions.confirmExpireBody", { orderNumber, transferId: payment.transferId ?? "" }),
        confirmLabel: t("paymentActions.expire"),
        tone: "danger",
      });
      if (!ok) return;
    } else if (action === "capture") {
      const ok = await confirm({
        title: t("paymentActions.capture"),
        body: t("paymentActions.confirmCaptureBody", { orderNumber, amount: formatYen(amount) }),
        confirmLabel: t("paymentActions.capture"),
      });
      if (!ok) return;
    } else if (action === "deposit") {
      depositRef.current = { amount: outstanding };
      const ok = await confirm({
        title: t("paymentActions.deposit"),
        body: t("paymentActions.confirmDepositBody", {
          transferId: payment.transferId ?? "",
          amount: formatYen(amount),
          deposited: formatYen(deposited),
        }),
        confirmLabel: t("paymentActions.deposit"),
        fields: <DepositFields outstanding={outstanding} valueRef={depositRef} />,
      });
      if (!ok) return;
      body = { amount: depositRef.current.amount };
    } else if (action === "refund") {
      // Phase C: refunds are requests (any operator) decided by a master.
      refundRef.current = { amount: remaining, reasonCode: "customer", reason: "", force: false };
      const ok = await confirm({
        title: t("paymentActions.refund"),
        body: t("paymentActions.confirmRefundBody", { orderNumber, remaining: formatYen(remaining) }),
        confirmLabel: t("paymentActions.refund"),
        tone: "danger",
        fields: <RefundFields remaining={remaining} deadlinePassed={deadlinePassed} isMaster={canForceRefund} valueRef={refundRef} />,
      });
      if (!ok) return;
      setBusy(action);
      const { amount: refundAmount, reasonCode, reason, force } = refundRef.current;
      const res = await apiJson(`/api/refunds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: id, amount: refundAmount, reasonCode, reason, force }),
      });
      setBusy(null);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      const message = t("paymentActions.refundRequested");
      setNotice(message);
      pushFlash(`payment:${id}`, message);
      router.refresh();
      return;
    }

    setBusy(action);
    const res = await apiJson<{ status: PaymentStatus; depositDiff: "short" | "excess" | null }>(`/api/payments/${id}/${action}`, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const message = doneMessage(action, res.data);
    setNotice(message);
    pushFlash(`payment:${id}`, message);
    router.refresh();
  }

  function doneMessage(action: PaymentAction, data: { status: PaymentStatus; depositDiff: "short" | "excess" | null }): string {
    switch (action) {
      case "capture":
        return t("paymentActions.captured");
      case "cancel":
        return t("paymentActions.voided");
      case "fail":
        return t("paymentActions.failed");
      case "expire":
        return t("paymentActions.expired");
      case "deposit":
        return data.status === "captured"
          ? data.depositDiff === "excess"
            ? t("paymentActions.depositedExcess")
            : t("paymentActions.depositedComplete")
          : t("paymentActions.depositedShort");
      default:
        return t("paymentActions.refunded");
    }
  }

  const label = (a: PaymentAction) => (busy === a ? t("common.processing") : t(`paymentActions.${a}` as MessageKey));
  const hint = (a: PaymentAction) => t(`paymentActions.${a}Hint` as MessageKey);
  const style: Record<PaymentAction, string> = {
    capture: "btn-primary",
    deposit: "btn-primary",
    cancel: "btn-secondary",
    fail: "btn-secondary",
    expire: "btn-secondary",
    refund: "btn-danger",
    chargeback: "btn-secondary",
  };

  return (
    <div className="space-y-4" aria-busy={busy !== null}>
      <div className="space-y-2">
        {offered.map((a) => (
          <ActionButton key={a} label={label(a)} hint={hint(a)} enabled={allowed(a)} busy={busy !== null} className={style[a]} onClick={() => run(a)} />
        ))}
        {!anyPossible && <p className="text-xs text-slate-500">{t("paymentActions.noActions")}</p>}
        {isBank && (
          <div className="border-t border-slate-100 pt-2">
            <ActionButton label={t("paymentActions.renotify")} hint={renotifyPossible ? t("paymentActions.renotifyMasterHint") : t("paymentActions.renotifyHint")} enabled={renotifyAllowed} busy={busy !== null} className="btn-secondary" onClick={renotify} />
            {payment.renotifyCount > 0 && payment.renotifiedAt && (
              <p className="mt-1 text-[11px] text-slate-500">{t("paymentActions.renotifyLast", { count: payment.renotifyCount, at: formatDate(payment.renotifiedAt) })}</p>
            )}
          </div>
        )}
        {needsMaster && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("paymentActions.masterOnly")}</p>
        )}
      </div>

      {notice && (
        <p role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      )}

      <WebhookSimulator paymentId={id} available={payment.provider.webhookAvailable} onDone={() => router.refresh()} />
    </div>
  );
}

function ActionButton({
  label,
  hint,
  enabled,
  busy,
  className,
  onClick,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  busy: boolean;
  className: string;
  onClick: () => void;
}) {
  return (
    <div>
      <button type="button" className={`${className} w-full`} disabled={!enabled || busy} onClick={onClick}>
        {label}
      </button>
      {!enabled && <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

function DepositFields({ outstanding, valueRef }: { outstanding: number; valueRef: MutableRefObject<{ amount: number }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [amount, setAmount] = useState(String(outstanding));
  const n = Number(amount);
  const valid = Number.isInteger(n) && n > 0;

  useEffect(() => {
    valueRef.current = { amount: n };
    update({ confirmDisabled: !valid });
  }, [n, valid, update, valueRef]);

  return (
    <div>
      <label htmlFor="deposit-amount" className="label">
        {t("paymentActions.depositAmount")}
      </label>
      <input
        id="deposit-amount"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        className="input"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-invalid={!valid}
        aria-describedby="deposit-amount-help"
      />
      <p id="deposit-amount-help" className="help">
        {t("paymentActions.depositHelp", { outstanding: formatYen(outstanding) })}
      </p>
    </div>
  );
}

function RefundFields({
  remaining,
  deadlinePassed,
  isMaster,
  valueRef,
}: {
  remaining: number;
  deadlinePassed: boolean;
  isMaster: boolean;
  valueRef: MutableRefObject<{ amount: number; reasonCode: RefundReason; reason: string; force: boolean }>;
}) {
  const t = useT();
  const { update } = useConfirm();
  const [amount, setAmount] = useState(String(remaining));
  const [reasonCode, setReasonCode] = useState<RefundReason>("customer");
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const n = Number(amount);
  const reasonRequired = reasonCode === "other" || deadlinePassed;
  const valid = Number.isInteger(n) && n > 0 && n <= remaining && (!reasonRequired || reason.trim().length > 0) && (!deadlinePassed || (isMaster && force));

  useEffect(() => {
    valueRef.current = { amount: n, reasonCode, reason, force };
    update({ confirmDisabled: !valid });
  }, [n, reasonCode, reason, force, valid, update, valueRef]);

  return (
    <>
      <div>
        <label htmlFor="refund-amount" className="label">
          {t("paymentActions.refundAmount")}
        </label>
        <input
          id="refund-amount"
          type="number"
          inputMode="numeric"
          min={1}
          max={remaining}
          step={1}
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={!(Number.isInteger(n) && n > 0 && n <= remaining)}
          aria-describedby="refund-amount-help"
        />
        <p id="refund-amount-help" className="help">
          {t("paymentActions.refundRemaining", { remaining: formatYen(remaining) })}
        </p>
      </div>
      <div>
        <label htmlFor="refund-reason-code" className="label">
          {t("paymentActions.refundReasonCode")}
        </label>
        <select id="refund-reason-code" className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as RefundReason)}>
          {REFUND_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`refundEnums.reason.${r}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="refund-reason" className="label">
          {reasonRequired ? t("paymentActions.refundReasonRequired") : t("paymentActions.refundReason")}
        </label>
        <input id="refund-reason" className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={reasonRequired && reason.trim().length === 0} />
      </div>
      {deadlinePassed && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <p>{t("paymentActions.refundDeadlinePassed")}</p>
          {isMaster && (
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              {t("paymentActions.refundForce")}
            </label>
          )}
        </div>
      )}
    </>
  );
}

function WebhookSimulator({ paymentId, available, onDone }: { paymentId: string; available: boolean; onDone: () => void }) {
  const t = useT();
  const apiJson = useApiJson();
  const [type, setType] = useState<WebhookEventType>("payment.captured");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(() => {
    const flash = popFlash(`webhook:${paymentId}`);
    return flash ? { ok: true, message: flash } : null;
  });

  async function send() {
    setBusy(true);
    setResult(null);
    const res = await apiJson<{ delivered: boolean; downstream: unknown }>(`/api/payments/${paymentId}/simulate-webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type }),
    });
    setBusy(false);
    if (!res.ok) {
      setResult({ ok: false, message: res.error.message });
      return;
    }
    const downstream = res.data.downstream as { ok?: boolean; error?: { message?: string }; data?: { duplicate?: boolean } } | null;
    if (downstream && downstream.ok === false) {
      setResult({ ok: false, message: downstream.error?.message ?? t("common.genericError") });
    } else {
      const message = downstream?.data?.duplicate ? t("paymentActions.simulateDuplicate") : t("paymentActions.simulateDone", { type });
      setResult({ ok: true, message });
      pushFlash(`webhook:${paymentId}`, message);
      onDone();
    }
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentActions.simulateTitle")}</p>
      <p className="mt-1 text-xs text-slate-500">{t("paymentActions.simulateBody")}</p>
      {available ? (
        <div className="mt-2 flex gap-2">
          <label htmlFor="webhook-type" className="sr-only">
            {t("paymentActions.simulateType")}
          </label>
          <select id="webhook-type" className="input" value={type} onChange={(e) => setType(e.target.value as WebhookEventType)}>
            {WEBHOOK_EVENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary shrink-0" disabled={busy} onClick={send}>
            {busy ? t("common.processing") : t("paymentActions.simulateSend")}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">{t("paymentActions.simulateNoSecret")}</p>
      )}
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
            result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
