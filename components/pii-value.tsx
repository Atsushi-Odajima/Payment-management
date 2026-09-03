"use client";

// Masked personal-data value with an audited "unmask" control (Phase M-2).
// Operators with pii.unmask (admin / cs) can reveal the real value; the
// reveal calls POST /api/pii/unmask, which writes an audit row per call.

import { useState } from "react";
import { useApiJson, useT } from "./language-provider";
import { useCan } from "./session-provider";

export type UnmaskTarget = { type: "payment" | "customer" | "subscription" | "unmatched_deposit" | "email_log"; id: string };

export function PiiValue({ masked, target, field, className }: { masked: string | null; target: UnmaskTarget; field: string; className?: string }) {
  const t = useT();
  const apiJson = useApiJson();
  const canUnmask = useCan("pii", "unmask");
  const [full, setFull] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (masked === null || masked === undefined || masked === "") return <span className="text-slate-500">—</span>;

  async function reveal() {
    setBusy(true);
    setError(null);
    const res = await apiJson<{ fields: Record<string, string | null> }>("/api/pii/unmask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: target.type, id: target.id }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setFull(res.data.fields[field] ?? null);
  }

  return (
    <span className={className}>
      <span>{full !== undefined ? (full ?? "—") : masked}</span>
      {full === undefined && canUnmask && (
        <button type="button" className="ml-2 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50" disabled={busy} onClick={reveal} title={t("pii.unmaskHint")}>
          {busy ? t("common.processing") : t("pii.unmask")}
        </button>
      )}
      {full !== undefined && <span className="ml-2 text-[11px] text-amber-700">{t("pii.unmasked")}</span>}
      {error && <span className="ml-2 text-[11px] text-rose-700">{error}</span>}
    </span>
  );
}
