"use client";

// Merchant password: always shown as a fixed mask. The master role can reveal
// it (eye icon → GET /api/merchants/:id/password) and regenerate it. The API
// enforces the role from the cookie, so the general role cannot bypass the UI.

import { useState } from "react";
import { useApiJson, useT } from "./language-provider";
import { useRole } from "./session-provider";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { PASSWORD_MASK } from "@/lib/merchants/password-mask";
import { cn } from "@/lib/utils";

export function MerchantPasswordField({
  merchantId,
  allowRegenerate = true,
}: {
  merchantId: string;
  allowRegenerate?: boolean;
}) {
  const t = useT();
  const { isMaster } = useRole();
  const apiJson = useApiJson();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleReveal() {
    setError(null);
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    setBusy(true);
    const res = await apiJson<{ password: string }>(`/api/merchants/${merchantId}/password`);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setRevealed(res.data.password);
  }

  async function regenerate() {
    setError(null);
    const ok = await confirm({
      title: t("merchantDetail.regenerate"),
      body: t("merchantDetail.regenerateBody"),
      confirmLabel: t("merchantDetail.regenerate"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const res = await apiJson<{ password: string }>(`/api/merchants/${merchantId}/password`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setRevealed(res.data.password);
    toast.show(t("merchantDetail.regenerated"));
  }

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div
          className={cn(
            "input flex flex-1 items-center bg-slate-50 font-mono text-slate-800",
            revealed !== null && "select-all",
          )}
          aria-live="polite"
        >
          {revealed ?? PASSWORD_MASK}
        </div>
        <button
          type="button"
          onClick={toggleReveal}
          disabled={!isMaster || busy}
          aria-pressed={revealed !== null}
          aria-label={revealed !== null ? t("merchantDetail.hidePassword") : t("merchantDetail.showPassword")}
          title={isMaster ? undefined : t("merchantDetail.masterOnly")}
          className="btn-secondary px-3"
        >
          <EyeIcon off={revealed !== null} />
        </button>
        {allowRegenerate && isMaster && (
          <button type="button" onClick={regenerate} disabled={busy} className="btn-secondary shrink-0">
            {t("merchantDetail.regenerate")}
          </button>
        )}
      </div>
      <p className="help">
        {isMaster ? t("merchantDetail.passwordHelpMaster") : t("merchantDetail.masterOnly")}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" strokeLinecap="round" />}
    </svg>
  );
}
