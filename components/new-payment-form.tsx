"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProviderOption {
  id: string;
  displayName: string;
  providerName: string;
  categoryLabel: string;
  testMode: boolean;
}

export function NewPaymentForm({ providers }: { providers: ProviderOption[] }) {
  const router = useRouter();
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [orderNumber, setOrderNumber] = useState(
    () => `ORD-${Date.now().toString(36).toUpperCase()}`,
  );
  const [amount, setAmount] = useState("3980");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [description, setDescription] = useState("");
  const [autoCapture, setAutoCapture] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProvider = providers.find((p) => p.id === providerId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId,
          orderNumber,
          amount: Number(amount),
          customerName: customerName || null,
          customerEmail: customerEmail || null,
          description: description || null,
          autoCapture,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "決済の作成に失敗しました");
      router.push(`/payments/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <label htmlFor="providerId" className="label">
          決済プロバイダ <span className="text-rose-600">*</span>
        </label>
        <select
          id="providerId"
          className="input"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          required
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName} — {p.providerName} ({p.categoryLabel})
              {p.testMode ? " ・テスト" : " ・本番"}
            </option>
          ))}
        </select>
        {selectedProvider?.testMode && (
          <p className="help">
            選択中のプロバイダはテストモードです。実際の決済は発生しません。
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="orderNumber" className="label">
            注文番号 <span className="text-rose-600">*</span>
          </label>
          <input
            id="orderNumber"
            className="input"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="amount" className="label">
            金額 (JPY) <span className="text-rose-600">*</span>
          </label>
          <input
            id="amount"
            type="number"
            min={1}
            step={1}
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="customerName" className="label">
            顧客名
          </label>
          <input
            id="customerName"
            className="input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="山田 太郎"
          />
        </div>
        <div>
          <label htmlFor="customerEmail" className="label">
            顧客メール
          </label>
          <input
            id="customerEmail"
            type="email"
            className="input"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="customer@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="label">
          メモ (商品名や説明)
        </label>
        <textarea
          id="description"
          className="input min-h-[80px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="春物アウターセット x 1"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={autoCapture}
          onChange={(e) => setAutoCapture(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
        />
        作成と同時に売上を確定 (オーソリ→キャプチャを即時実行)
      </label>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-5">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "作成中…" : "決済を作成"}
        </button>
      </div>
    </form>
  );
}
