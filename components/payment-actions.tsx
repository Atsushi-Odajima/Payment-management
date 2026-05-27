"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PaymentActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "capture" | "cancel" | "refund") {
    if (action === "cancel" && !confirm("この決済を取消します。よろしいですか？")) return;
    if (action === "refund" && !confirm("この決済を返金処理します。よろしいですか？")) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "処理に失敗しました");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
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
        {busy === "capture" ? "処理中…" : "売上を確定 (Capture)"}
      </button>
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={!canCancel || !!busy}
        onClick={() => call("cancel")}
      >
        {busy === "cancel" ? "処理中…" : "取消 (Void)"}
      </button>
      <button
        type="button"
        className="btn-danger w-full"
        disabled={!canRefund || !!busy}
        onClick={() => call("refund")}
      >
        {busy === "refund" ? "処理中…" : "返金 (Refund)"}
      </button>
      {error && (
        <p className="text-xs text-rose-700">{error}</p>
      )}
      {!canCapture && !canCancel && !canRefund && (
        <p className="text-xs text-slate-500">この決済に対して可能な操作はありません。</p>
      )}
    </div>
  );
}
