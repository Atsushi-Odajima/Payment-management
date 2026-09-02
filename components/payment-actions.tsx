"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useApiJson, useT } from "./language-provider";
import { useConfirm } from "./confirm-dialog";
import { formatYen } from "@/lib/utils";
import {
  UI_ACTIONS,
  canTransition,
  type PaymentAction,
  type PaymentStatus,
} from "@/lib/payments/transitions";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@/lib/webhooks/events";
import { popFlash, pushFlash } from "@/lib/flash";

export interface PaymentActionsProps {
  id: string;
  orderNumber: string;
  status: PaymentStatus;
  amount: number;
  amountRefunded: number;
  /** The provider has a webhook secret, so the simulator can sign events. */
  webhookAvailable: boolean;
}

type UiAction = Exclude<PaymentAction, "fail">;

export function PaymentActions(props: PaymentActionsProps) {
  const { id, orderNumber, status, amount, amountRefunded, webhookAvailable } = props;
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Survives the remount that router.refresh() can cause (see lib/flash.ts).
  const [notice, setNotice] = useState<string | null>(() => popFlash(`payment:${id}`) ?? null);
  const refundRef = useRef<{ amount: number; reason: string }>({ amount: 0, reason: "" });

  const remaining = amount - amountRefunded;
  const can = (a: UiAction) => canTransition(status, a);
  const anyAction = UI_ACTIONS.some((a) => can(a as UiAction));

  async function run(action: UiAction) {
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
    } else if (action === "refund") {
      refundRef.current = { amount: remaining, reason: "" };
      const ok = await confirm({
        title: t("paymentActions.refund"),
        body: t("paymentActions.confirmRefundBody", { orderNumber, remaining: formatYen(remaining) }),
        confirmLabel: t("paymentActions.refund"),
        tone: "danger",
        fields: <RefundFields remaining={remaining} valueRef={refundRef} />,
      });
      if (!ok) return;
      body = { amount: refundRef.current.amount, reason: refundRef.current.reason || null };
    }

    setBusy(action);
    const res = await apiJson<{ status: PaymentStatus }>(`/api/payments/${id}/${action}`, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const message =
      action === "capture"
        ? t("paymentActions.captured")
        : action === "cancel"
          ? t("paymentActions.voided")
          : t("paymentActions.refunded");
    setNotice(message);
    pushFlash(`payment:${id}`, message);
    router.refresh();
  }

  return (
    <div className="space-y-4" aria-busy={busy !== null}>
      <div className="space-y-2">
        <ActionButton
          label={busy === "capture" ? t("common.processing") : t("paymentActions.capture")}
          hint={t("paymentActions.captureHint")}
          enabled={can("capture")}
          busy={busy !== null}
          className="btn-primary"
          onClick={() => run("capture")}
        />
        <ActionButton
          label={busy === "cancel" ? t("common.processing") : t("paymentActions.cancel")}
          hint={t("paymentActions.cancelHint")}
          enabled={can("cancel")}
          busy={busy !== null}
          className="btn-secondary"
          onClick={() => run("cancel")}
        />
        <ActionButton
          label={busy === "refund" ? t("common.processing") : t("paymentActions.refund")}
          hint={t("paymentActions.refundHint")}
          enabled={can("refund")}
          busy={busy !== null}
          className="btn-danger"
          onClick={() => run("refund")}
        />
        {!anyAction && <p className="text-xs text-slate-500">{t("paymentActions.noActions")}</p>}
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

      <WebhookSimulator paymentId={id} available={webhookAvailable} onDone={() => router.refresh()} />
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

function RefundFields({
  remaining,
  valueRef,
}: {
  remaining: number;
  valueRef: MutableRefObject<{ amount: number; reason: string }>;
}) {
  const t = useT();
  const { update } = useConfirm();
  const [amount, setAmount] = useState(String(remaining));
  const [reason, setReason] = useState("");
  const n = Number(amount);
  const valid = Number.isInteger(n) && n > 0 && n <= remaining;

  useEffect(() => {
    valueRef.current = { amount: n, reason };
    update({ confirmDisabled: !valid });
  }, [n, reason, valid, update, valueRef]);

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
          aria-invalid={!valid}
          aria-describedby="refund-amount-help"
        />
        <p id="refund-amount-help" className="help">
          {t("paymentActions.refundRemaining", { remaining: formatYen(remaining) })}
        </p>
      </div>
      <div>
        <label htmlFor="refund-reason" className="label">
          {t("paymentActions.refundReason")}
        </label>
        <input
          id="refund-reason"
          className="input"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </>
  );
}

function WebhookSimulator({
  paymentId,
  available,
  onDone,
}: {
  paymentId: string;
  available: boolean;
  onDone: () => void;
}) {
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
    const res = await apiJson<{ delivered: boolean; downstream: unknown }>(
      `/api/payments/${paymentId}/simulate-webhook`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }) },
    );
    setBusy(false);
    if (!res.ok) {
      setResult({ ok: false, message: res.error.message });
      return;
    }
    const downstream = res.data.downstream as { ok?: boolean; error?: { message?: string }; data?: { duplicate?: boolean } } | null;
    if (downstream && downstream.ok === false) {
      setResult({ ok: false, message: downstream.error?.message ?? t("common.genericError") });
    } else {
      const message = downstream?.data?.duplicate
        ? t("paymentActions.simulateDuplicate")
        : t("paymentActions.simulateDone", { type });
      setResult({ ok: true, message });
      pushFlash(`webhook:${paymentId}`, message);
      onDone();
    }
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("paymentActions.simulateTitle")}
      </p>
      <p className="mt-1 text-xs text-slate-500">{t("paymentActions.simulateBody")}</p>
      {available ? (
        <div className="mt-2 flex gap-2">
          <label htmlFor="webhook-type" className="sr-only">
            {t("paymentActions.simulateType")}
          </label>
          <select
            id="webhook-type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as WebhookEventType)}
          >
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
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
