"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useApiJson, useT } from "@/components/language-provider";
import { WirePayIcon } from "@/components/wire-pay-icon";

export function LoginView({ configured, demoHint }: { configured: boolean; demoHint?: string }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("auth.title")} description={t("auth.description")} />
      <form onSubmit={onSubmit} className="card space-y-5 p-6" aria-busy={busy}>
        <div className="flex items-center gap-3">
          <WirePayIcon className="h-10 w-10 rounded-lg shadow" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Wire Pay</p>
            <p className="text-xs text-slate-500">{t("brand.tagline")}</p>
          </div>
        </div>
        {!configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("auth.notConfigured")}
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="password" className="label">
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                autoFocus
              />
              {demoHint && <p className="help">{t("auth.demoHint", { hint: demoHint })}</p>}
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? t("auth.submitting") : t("auth.submit")}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
