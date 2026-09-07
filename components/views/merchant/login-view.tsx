"use client";

// Merchant portal login (Phase L-2): merchant code + password → the merchant
// cookie. Demo credentials are listed when DEMO_LOGIN_HINT is set.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiJson, useT } from "@/components/language-provider";
import { WirePayIcon } from "@/components/wire-pay-icon";

export function MerchantLoginView({ demo, showAdminLink = false }: { demo?: Array<{ merchantCode: string; siteName: string; password: string }>; showAdminLink?: boolean }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const [merchantCode, setMerchantCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson("/api/merchant-portal/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantCode, password }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    router.push("/merchant");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.loginTitle")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.loginDescription")}</p>
      <form onSubmit={onSubmit} className="card mt-6 space-y-5 p-6" aria-busy={busy}>
        <div className="flex items-center gap-3">
          <WirePayIcon className="h-10 w-10 rounded-lg shadow" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Wire Pay</p>
            <p className="text-xs text-slate-500">{t("merchantPortal.tagline")}</p>
          </div>
        </div>
        <div>
          <label htmlFor="merchantCode" className="label">
            {t("merchantPortal.merchantCode")}
          </label>
          <input id="merchantCode" name="merchant-code" className="input font-mono" value={merchantCode} onChange={(e) => setMerchantCode(e.target.value)} required autoComplete="off" autoFocus autoCapitalize="characters" placeholder="MER-00001" />
        </div>
        <div>
          <label htmlFor="merchantPassword" className="label">
            {t("merchantPortal.password")}
          </label>
          <input id="merchantPassword" name="merchant-password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {demo && demo.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-medium text-slate-700">{t("merchantPortal.demoAccounts")}</p>
            {demo.map((d) => (
              <p key={d.merchantCode} className="mt-1 font-mono">
                {d.merchantCode} / {d.password} <span className="font-sans text-slate-500">({d.siteName})</span>
              </p>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t("merchantPortal.submitting") : t("merchantPortal.submit")}
        </button>
        <p className="text-center text-xs text-slate-500">
          <Link href="/docs/api" className="text-brand-700 hover:underline">
            {t("merchantPortal.docsLink")}
          </Link>
          {showAdminLink && (
            <>
              {" · "}
              <Link href="/login" className="text-brand-700 hover:underline">
                {t("merchantPortal.adminLink")}
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
