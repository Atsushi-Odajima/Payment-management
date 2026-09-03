"use client";

// Your own account: profile, password change and two-factor enrolment
// (QR code → authenticator app → confirm with a code).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AdminStatusBadge, RoleBadge } from "@/components/admin-badges";
import { DetailRow } from "@/components/ui/detail-row";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import type { AdminView } from "@/lib/admin/types";
import { PASSWORD_MIN_LENGTH } from "@/lib/admin/types";

export function AccountView({ admin: initial }: { admin: AdminView }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const [admin, setAdmin] = useState(initial);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const mismatch = confirmPassword !== "" && newPassword !== confirmPassword;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setPwBusy(true);
    setPwError(null);
    const res = await apiJson("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    setPwBusy(false);
    if (!res.ok) {
      setPwError(res.error.message);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.show(t("account.passwordChanged"));
  }

  // Two-factor
  const [setup, setSetup] = useState<{ secret: string; uri: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);

  async function startSetup() {
    setTotpBusy(true);
    setTotpError(null);
    const res = await apiJson<{ secret: string; uri: string; qrSvg: string }>("/api/account/totp/setup", { method: "POST" });
    setTotpBusy(false);
    if (!res.ok) {
      setTotpError(res.error.message);
      return;
    }
    setSetup(res.data);
    setCode("");
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setTotpBusy(true);
    setTotpError(null);
    const res = await apiJson("/api/account/totp/enable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    setTotpBusy(false);
    if (!res.ok) {
      setTotpError(res.error.message);
      return;
    }
    setSetup(null);
    setAdmin((a) => ({ ...a, totpEnabled: true }));
    toast.show(t("account.totpEnabled"));
    router.refresh();
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setTotpBusy(true);
    setTotpError(null);
    const res = await apiJson("/api/account/totp/disable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: disablePassword }) });
    setTotpBusy(false);
    if (!res.ok) {
      setTotpError(res.error.message);
      return;
    }
    setDisablePassword("");
    setAdmin((a) => ({ ...a, totpEnabled: false }));
    toast.show(t("account.totpDisabled"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t("account.title")} description={t("account.description")} helpHref="/manual/admins" />
      <div className="space-y-6">
        <section className="card divide-y divide-slate-100" aria-labelledby="acct-profile">
          <h2 id="acct-profile" className="px-5 py-3 text-sm font-semibold text-slate-800">
            {t("account.sectionProfile")}
          </h2>
          <DetailRow label={t("adminForm.loginId")}>
            <span className="font-mono">{admin.loginId}</span>
          </DetailRow>
          <DetailRow label={t("adminForm.name")}>{admin.name}</DetailRow>
          <DetailRow label={t("adminForm.email")}>{admin.email}</DetailRow>
          <DetailRow label={t("adminForm.role")}>
            <RoleBadge role={admin.role} />
          </DetailRow>
          <DetailRow label={t("adminForm.status")}>
            <AdminStatusBadge status={admin.status} />
          </DetailRow>
          <DetailRow label={t("admins.thLastLogin")}>{admin.lastLoginAt ? formatDate(admin.lastLoginAt) : t("adminDetail.never")}</DetailRow>
        </section>

        <section className="card p-5" aria-labelledby="acct-password">
          <h2 id="acct-password" className="text-sm font-semibold text-slate-800">
            {t("account.sectionPassword")}
          </h2>
          <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-3" aria-busy={pwBusy}>
            <div>
              <label htmlFor="currentPassword" className="label">
                {t("account.currentPassword")}
              </label>
              <input id="currentPassword" type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <div>
              <label htmlFor="newPassword" className="label">
                {t("account.newPassword")}
              </label>
              <input id="newPassword" type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
              <p className="help">{t("account.passwordRule", { min: PASSWORD_MIN_LENGTH })}</p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="label">
                {t("account.newPasswordConfirm")}
              </label>
              <input id="confirmPassword" type="password" className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" aria-invalid={mismatch} />
              {mismatch && <p className="mt-1 text-xs text-rose-700">{t("account.mismatch")}</p>}
            </div>
            {pwError && (
              <p role="alert" className="sm:col-span-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {pwError}
              </p>
            )}
            <div className="sm:col-span-3 flex justify-end">
              <button type="submit" className="btn-primary" disabled={pwBusy || mismatch || newPassword.length < PASSWORD_MIN_LENGTH}>
                {pwBusy ? t("common.processing") : t("account.changePassword")}
              </button>
            </div>
          </form>
        </section>

        <section className="card p-5" aria-labelledby="acct-totp">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="acct-totp" className="text-sm font-semibold text-slate-800">
              {t("account.sectionTotp")}
            </h2>
            <span className={`badge ${admin.totpEnabled ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
              {admin.totpEnabled ? t("account.totpStatusOn") : t("account.totpStatusOff")}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("account.totpIntro")}</p>

          {admin.totpEnabled ? (
            <form onSubmit={disable} className="mt-4 flex flex-wrap items-end gap-3" aria-busy={totpBusy}>
              <div className="min-w-[16rem] flex-1">
                <label htmlFor="disablePassword" className="label">
                  {t("account.totpDisablePassword")}
                </label>
                <input id="disablePassword" type="password" className="input" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <button type="submit" className="btn-danger" disabled={totpBusy || !disablePassword}>
                {totpBusy ? t("common.processing") : t("account.totpDisable")}
              </button>
            </form>
          ) : setup ? (
            <form onSubmit={enable} className="mt-4 grid gap-5 sm:grid-cols-[200px_1fr]" aria-busy={totpBusy}>
              {/* The QR is an SVG string from the server; rendering it as an <img> keeps it out of the DOM as markup. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} alt={t("account.totpQrAlt")} width={200} height={200} className="rounded-lg border border-slate-200 bg-white" />
              <div className="space-y-3">
                <p className="text-sm text-slate-700">{t("account.totpSetupBody")}</p>
                <p className="text-xs text-slate-500">
                  {t("account.totpSecret")}: <code className="font-mono text-slate-800">{setup.secret}</code>
                </p>
                <div>
                  <label htmlFor="totpConfirm" className="label">
                    {t("account.totpConfirmCode")}
                  </label>
                  <input id="totpConfirm" className="input max-w-[12rem] font-mono text-lg tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required autoComplete="one-time-code" />
                </div>
                {totpError && (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    {totpError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary" disabled={totpBusy || code.length < 6}>
                    {totpBusy ? t("common.processing") : t("account.totpEnable")}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setSetup(null)}>
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="mt-4">
              <button type="button" className="btn-primary" disabled={totpBusy} onClick={startSetup}>
                {totpBusy ? t("common.processing") : t("account.totpSetup")}
              </button>
            </div>
          )}
          {totpError && !setup && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {totpError}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
