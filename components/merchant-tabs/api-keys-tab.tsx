"use client";

// API keys tab (B-4): issue, rotate (with a grace period) and revoke keys
// and signing secrets per environment. The plaintext is shown once.

import { useEffect, useState, type MutableRefObject, useRef } from "react";
import { useRouter } from "next/navigation";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { FormField } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { API_KEY_KINDS, API_KEY_MODES, MAX_ROTATION_GRACE_DAYS, ROTATION_GRACE_DAYS, type ApiKeyKind, type ApiKeyMode, type ApiKeyStatus, type ApiKeyView } from "@/lib/merchants/api-keys";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Wire = Omit<ApiKeyView, "issuedAt" | "expiresAt" | "revokedAt" | "lastUsedAt"> & { issuedAt: string; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null };
const withDates = (k: Wire): ApiKeyView => ({
  ...k,
  issuedAt: new Date(k.issuedAt),
  expiresAt: k.expiresAt ? new Date(k.expiresAt) : null,
  revokedAt: k.revokedAt ? new Date(k.revokedAt) : null,
  lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt) : null,
});

const STATUS_CLASS: Record<ApiKeyStatus, string> = {
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  expiring: "bg-amber-100 text-amber-800 ring-amber-200",
  expired: "bg-slate-200 text-slate-700 ring-slate-300",
  revoked: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function ApiKeysTab({ merchantId, merchantCode, keys: initial }: { merchantId: string; merchantCode: string; keys: ApiKeyView[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const formatDate = useFormatDateTime();
  const [keys, setKeys] = useState<ApiKeyView[]>(initial);
  const [mode, setMode] = useState<ApiKeyMode>("test");
  const [kind, setKind] = useState<ApiKeyKind>("api_key");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ plaintext: string; keyPrefix: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const graceRef = useRef<{ days: number }>({ days: ROTATION_GRACE_DAYS });

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy("issue");
    setError(null);
    const res = await apiJson<{ key: Wire; plaintext: string }>(`/api/merchants/${merchantId}/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, kind, label: label || undefined }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setKeys((k) => [withDates(res.data.key), ...k]);
    setRevealed({ plaintext: res.data.plaintext, keyPrefix: res.data.key.keyPrefix });
    setCopied(false);
    setLabel("");
    router.refresh();
  }

  async function rotate(key: ApiKeyView) {
    graceRef.current = { days: ROTATION_GRACE_DAYS };
    const ok = await confirm({
      title: t("apiKeys.rotate"),
      body: t("apiKeys.rotateBody", { prefix: key.keyPrefix }),
      confirmLabel: t("apiKeys.rotate"),
      fields: <GraceField valueRef={graceRef} />,
    });
    if (!ok) return;
    setBusy(key.id);
    const res = await apiJson<{ key: Wire; plaintext: string; keys: Wire[] }>(`/api/merchants/${merchantId}/api-keys/${key.id}/rotate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graceDays: graceRef.current.days }),
    });
    setBusy(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    setKeys(res.data.keys.map(withDates));
    setRevealed({ plaintext: res.data.plaintext, keyPrefix: res.data.key.keyPrefix });
    setCopied(false);
    router.refresh();
  }

  async function revoke(key: ApiKeyView) {
    const ok = await confirm({ title: t("apiKeys.revoke"), body: t("apiKeys.revokeBody", { prefix: key.keyPrefix }), confirmLabel: t("apiKeys.revoke"), tone: "danger" });
    if (!ok) return;
    setBusy(key.id);
    const res = await apiJson<{ key: Wire }>(`/api/merchants/${merchantId}/api-keys/${key.id}/revoke`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    setKeys((list) => list.map((k) => (k.id === key.id ? withDates(res.data.key) : k)));
    toast.show(t("apiKeys.revoked"));
    router.refresh();
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.plaintext);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      {revealed && (
        <div role="status" aria-live="polite" className="card space-y-3 border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-900">{t("apiKeys.revealedTitle")}</p>
          <p className="text-xs text-emerald-800">{t("apiKeys.revealedBody")}</p>
          <code className="block break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900">{revealed.plaintext}</code>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={copy}>
              {copied ? t("adminForm.copied") : t("apiKeys.copy")}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setRevealed(null)}>
              {t("apiKeys.dismiss")}
            </button>
          </div>
        </div>
      )}

      <section className="card overflow-hidden" aria-labelledby="apikeys-list">
        <h2 id="apikeys-list" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
          {t("apiKeys.title")}
        </h2>
        {keys.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t("apiKeys.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">{t("apiKeys.thMode")}</th>
                  <th scope="col" className="px-5 py-3">{t("apiKeys.thKind")}</th>
                  <th scope="col" className="px-5 py-3">{t("apiKeys.thKey")}</th>
                  <th scope="col" className="px-5 py-3">{t("apiKeys.thStatus")}</th>
                  <th scope="col" className="px-5 py-3">{t("apiKeys.thIssued")}</th>
                  <th scope="col" className="px-5 py-3">{t("apiKeys.thExpires")}</th>
                  <th scope="col" className="px-5 py-3">{t("apiKeys.thLastUsed")}</th>
                  <th scope="col" className="px-5 py-3 text-right">{t("apiKeys.thActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-5 py-3">
                      <span className={cn("badge", k.mode === "live" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-amber-100 text-amber-800 ring-amber-200")}>
                        {t(`mode.${k.mode}`)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{t(`apiKeys.kinds.${k.kind}` as MessageKey)}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-slate-900">{k.keyPrefix}</span>
                      {k.label && <p className="text-xs text-slate-500">{k.label}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("badge", STATUS_CLASS[k.status])}>{t(`apiKeys.statuses.${k.status}` as MessageKey)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDate(k.issuedAt)}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{k.expiresAt ? formatDate(k.expiresAt) : "—"}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{k.lastUsedAt ? formatDate(k.lastUsedAt) : t("apiKeys.neverUsed")}</td>
                    <td className="px-5 py-3 text-right">
                      {(k.status === "active" || k.status === "expiring") && (
                        <span className="inline-flex items-center gap-3">
                          <button type="button" className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50" disabled={busy !== null} onClick={() => rotate(k)}>
                            {t("apiKeys.rotate")}
                          </button>
                          <button type="button" className="text-xs font-medium text-rose-700 hover:underline disabled:opacity-50" disabled={busy !== null} onClick={() => revoke(k)}>
                            {t("apiKeys.revoke")}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form onSubmit={issue} className="card space-y-4 p-5" aria-busy={busy === "issue"}>
        <h2 className="text-sm font-semibold text-slate-800">{t("apiKeys.issueTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <SegmentedControl<ApiKeyMode>
            label={t("apiKeys.thMode")}
            value={mode}
            onChange={setMode}
            options={API_KEY_MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
          />
          <SegmentedControl<ApiKeyKind>
            label={t("apiKeys.thKind")}
            value={kind}
            onChange={setKind}
            options={API_KEY_KINDS.map((k) => ({ value: k, label: t(`apiKeys.kinds.${k}` as MessageKey) }))}
          />
          <FormField id="apikey-label" label={t("apiKeys.label")}>
            <input id="apikey-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={t("apiKeys.labelPlaceholder")} />
          </FormField>
        </div>
        <p className="text-xs text-slate-500">{kind === "signing_secret" ? t("apiKeys.kindSecretHelp") : t("apiKeys.kindKeyHelp")}</p>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy !== null}>
            {busy === "issue" ? t("common.processing") : t("apiKeys.issue")}
          </button>
        </div>
      </form>

      <section className="card p-5 text-xs text-slate-600">
        <p className="text-sm font-semibold text-slate-800">{t("apiKeys.pingTitle")}</p>
        <p className="mt-1">{t("apiKeys.pingBody", { code: merchantCode })}</p>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-900 px-3 py-2 font-mono text-[11px] text-slate-100">{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/merchant-api/ping \\
  -H "Authorization: Bearer wp_test_ak_..."`}</pre>
      </section>
    </div>
  );
}

function GraceField({ valueRef }: { valueRef: MutableRefObject<{ days: number }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [days, setDays] = useState(String(ROTATION_GRACE_DAYS));
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 0 && n <= MAX_ROTATION_GRACE_DAYS;
  useEffect(() => {
    valueRef.current = { days: n };
    update({ confirmDisabled: !valid });
  }, [n, valid, update, valueRef]);
  return (
    <div>
      <label htmlFor="grace-days" className="label">
        {t("apiKeys.graceDays")}
      </label>
      <input id="grace-days" type="number" min={0} max={MAX_ROTATION_GRACE_DAYS} className="input w-32" value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={!valid} />
      <p className="help">{t("apiKeys.graceHelp", { max: MAX_ROTATION_GRACE_DAYS })}</p>
    </div>
  );
}
