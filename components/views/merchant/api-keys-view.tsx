"use client";

// Merchant API keys (Phase L-2): read-only list plus self-service rotation of
// test keys. The new plaintext is shown once.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { ROTATION_GRACE_DAYS, type ApiKeyView } from "@/lib/merchants/api-keys";
import type { MessageKey } from "@/lib/i18n";
import { popFlash, pushFlash } from "@/lib/flash";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<ApiKeyView["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  expiring: "bg-amber-100 text-amber-800 ring-amber-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
  revoked: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function MerchantApiKeysView({ keys }: { keys: ApiKeyView[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const { confirm } = useConfirm();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Survives the remount that router.refresh() can cause (see lib/flash.ts).
  const [plaintext, setPlaintext] = useState<string | null>(() => popFlash("merchant:api-key") ?? null);
  const [copied, setCopied] = useState(false);

  async function rotate(k: ApiKeyView) {
    setError(null);
    const ok = await confirm({ title: t("merchantPortal.apiKeys.rotate"), body: t("merchantPortal.apiKeys.rotateConfirm", { prefix: k.keyPrefix, days: ROTATION_GRACE_DAYS }), confirmLabel: t("merchantPortal.apiKeys.rotate") });
    if (!ok) return;
    setBusy(k.id);
    const res = await apiJson<{ plaintext: string }>(`/api/merchant-portal/api-keys/${k.id}/rotate`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setPlaintext(res.data.plaintext);
    setCopied(false);
    pushFlash("merchant:api-key", res.data.plaintext);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.apiKeys.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.apiKeys.description")}</p>
      {plaintext && (
        <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">{t("merchantPortal.apiKeys.rotated")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1 font-mono text-xs">{plaintext}</code>
            <button
              type="button"
              className="btn-secondary px-2 py-1 text-xs"
              onClick={async () => {
                await navigator.clipboard?.writeText(plaintext).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? t("merchantPortal.apiKeys.copied") : t("merchantPortal.apiKeys.copy")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="card mt-4 overflow-hidden">
        {keys.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{t("merchantPortal.apiKeys.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("merchantPortal.apiKeys.thKey")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.apiKeys.thKind")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.apiKeys.thMode")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.apiKeys.thStatus")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.apiKeys.thIssued")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.apiKeys.thExpires")}</th>
                  <th className="px-5 py-3">{t("merchantPortal.apiKeys.thLastUsed")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-800">
                      {k.keyPrefix}
                      {k.label && <p className="font-sans text-xs text-slate-500">{k.label}</p>}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{t(`merchantPortal.apiKeys.kind.${k.kind}` as MessageKey)}</td>
                    <td className="px-5 py-3">
                      <span className={cn("badge", k.mode === "live" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-amber-100 text-amber-800 ring-amber-200")}>{k.mode === "live" ? t("common.live") : t("common.test")}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("badge", STATUS_CLASS[k.status])}>{t(`merchantPortal.apiKeys.status.${k.status}` as MessageKey)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDate(k.issuedAt).slice(0, 10)}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{k.expiresAt ? formatDate(k.expiresAt).slice(0, 10) : "—"}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{k.lastUsedAt ? formatDate(k.lastUsedAt) : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {k.mode === "test" && (k.status === "active" || k.status === "expiring") ? (
                        <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy !== null} onClick={() => rotate(k)}>
                          {busy === k.id ? t("common.processing") : t("merchantPortal.apiKeys.rotate")}
                        </button>
                      ) : k.mode === "live" ? (
                        <span className="text-xs text-slate-400">{t("merchantPortal.apiKeys.liveNote")}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {t("merchantPortal.apiKeys.docsHint")}{" "}
        <Link href="/docs/api" className="text-brand-700 hover:underline">
          {t("merchantPortal.docsLink")} →
        </Link>
      </p>
    </div>
  );
}
