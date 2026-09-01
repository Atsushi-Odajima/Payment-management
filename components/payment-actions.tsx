"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiFetch, useT } from "./language-provider";

export function PaymentActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const t = useT();
  const apiFetch = useApiFetch();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "capture" | "cancel" | "refund") {
    if (action === "cancel" && !confirm(t("paymentActions.confirmCancel"))) return;
    if (action === "refund" && !confirm(t("paymentActions.confirmRefund"))) return;
    setBusy(action);
    setError(null);
    try {
      const res = await apiFetch(`/api/payments/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("paymentActions.failed"));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.genericError"));
    } finally {
      setBusy(null);
    }
  }

  const canCapture = status === "pending" || status === "authorized";
  const canCancel = status === "pending" || status === "authorized";
  const canRefund = status === "captured";

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-primary w-full"
        disabled={!canCapture || !!busy}
        onClick={() => call("capture")}
      >
        {busy === "capture" ? t("common.processing") : t("paymentActions.capture")}
      </button>
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={!canCancel || !!busy}
        onClick={() => call("cancel")}
      >
        {busy === "cancel" ? t("common.processing") : t("paymentActions.cancel")}
      </button>
      <button
        type="button"
        className="btn-danger w-full"
        disabled={!canRefund || !!busy}
        onClick={() => call("refund")}
      >
        {busy === "refund" ? t("common.processing") : t("paymentActions.refund")}
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!canCapture && !canCancel && !canRefund && (
        <p className="text-xs text-slate-500">{t("paymentActions.noActions")}</p>
      )}
    </div>
  );
}
