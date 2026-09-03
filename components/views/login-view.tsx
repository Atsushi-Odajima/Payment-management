"use client";

// Login: step 1 login id + password, step 2 the authenticator code when the
// account has two-factor enabled. Demo credentials are listed when the
// server passes them (DEMO_LOGIN_HINT is set).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useApiJson, useT } from "@/components/language-provider";
import { WirePayIcon } from "@/components/wire-pay-icon";

export interface DemoAccount {
  loginId: string;
  password: string;
}

export function LoginView({ demo }: { demo?: { master: DemoAccount; general: DemoAccount } }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "totp">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function done() {
    router.push("/");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ authenticated: boolean; requiresTwoFactor?: boolean }>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (res.data.requiresTwoFactor) {
      setStep("totp");
      return;
    }
    done();
  }

  async function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson("/api/auth/2fa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    done();
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("auth.title")} description={t("auth.description")} />
      {step === "password" ? (
        <form onSubmit={onSubmit} className="card space-y-5 p-6" aria-busy={busy}>
          <Brand />
          <div>
            <label htmlFor="loginId" className="label">
              {t("auth.loginId")}
            </label>
            <input id="loginId" className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoComplete="username" autoFocus autoCapitalize="none" />
          </div>
          <div>
            <label htmlFor="password" className="label">
              {t("auth.password")}
            </label>
            <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {demo && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="font-medium text-slate-700">{t("auth.demoAccounts")}</p>
              <p className="mt-1 font-mono">{t("auth.demoMaster", { id: demo.master.loginId, password: demo.master.password })}</p>
              <p className="font-mono">{t("auth.demoGeneral", { id: demo.general.loginId, password: demo.general.password })}</p>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t("auth.submitting") : t("auth.submit")}
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmitCode} className="card space-y-5 p-6" aria-busy={busy}>
          <Brand />
          <div>
            <p className="text-sm font-semibold text-slate-900">{t("auth.totpTitle")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("auth.totpDescription")}</p>
          </div>
          <div>
            <label htmlFor="totp-code" className="label">
              {t("auth.totpCode")}
            </label>
            <input id="totp-code" className="input font-mono text-lg tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" pattern="[0-9]*" maxLength={6} required autoComplete="one-time-code" autoFocus />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t("auth.submitting") : t("auth.totpSubmit")}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={() => setStep("password")}>
            {t("auth.backToLogin")}
          </button>
        </form>
      )}
    </div>
  );
}

function Brand() {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <WirePayIcon className="h-10 w-10 rounded-lg shadow" />
      <div>
        <p className="text-sm font-semibold text-slate-900">Wire Pay</p>
        <p className="text-xs text-slate-500">{t("brand.tagline")}</p>
      </div>
    </div>
  );
}
