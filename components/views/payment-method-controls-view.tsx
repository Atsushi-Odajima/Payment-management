"use client";

// Settings → payment method suspension (Phase I-3): the four global switches.
// Suspending asks for a reason (and an optional auto-resume time), is admin
// only, and offers to draft an incident announcement afterwards.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { PageHeader } from "@/components/page-header";
import { useApiJson, useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useCan } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { CONTROLLED_METHODS, type MethodControlRow } from "@/lib/payments/method-control-types";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function methodLabel(m: string, lang: "ja" | "en"): string {
  const c = CATEGORIES.find((x) => x.key === m);
  return c ? pickText(c.label, lang) : m;
}

/** One suspend / resume switch. Shared by the settings page (global) and the merchant tab (merchant). */
export function MethodControlSwitch({ row, scope, merchantId, disabled, busy, onBusy, onDone }: { row: MethodControlRow; scope: "global" | "merchant"; merchantId?: string; disabled: boolean; busy: boolean; onBusy: (b: boolean) => void; onDone: (suspended: boolean, method: string) => void }) {
  const t = useT();
  const { lang } = useLang();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const formatDate = useFormatDateTime();
  const ref = useRef<{ reason: string; resumeAt: string }>({ reason: "", resumeAt: "" });

  async function toggle() {
    const suspend = !row.suspended;
    ref.current = { reason: "", resumeAt: "" };
    const label = methodLabel(row.method, lang);
    const ok = await confirm({
      title: suspend ? t("methodControls.suspend") : t("methodControls.resume"),
      body: suspend ? t(scope === "global" ? "methodControls.confirmSuspendGlobal" : "methodControls.confirmSuspendMerchant", { method: label }) : t("methodControls.confirmResume", { method: label }),
      confirmLabel: suspend ? t("methodControls.suspend") : t("methodControls.resume"),
      tone: suspend ? "danger" : "primary",
      fields: suspend ? <SuspendFields valueRef={ref} /> : undefined,
    });
    if (!ok) return;
    onBusy(true);
    const res = await apiJson<MethodControlRow>("/api/payment-method-controls", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, merchantId: merchantId ?? null, method: row.method, suspended: suspend, reason: ref.current.reason, resumeAt: ref.current.resumeAt ? new Date(ref.current.resumeAt).toISOString() : "" }),
    });
    onBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t(suspend ? "methodControls.suspended" : "methodControls.resumed", { method: label }));
    onDone(suspend, row.method);
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
      <button
        type="button"
        role="switch"
        aria-checked={!row.suspended}
        aria-label={t("methodControls.switchLabel", { method: methodLabel(row.method, lang) })}
        className={cn("relative inline-flex h-7 w-14 items-center rounded-full transition", row.suspended ? "bg-rose-500" : "bg-emerald-500", (disabled || busy) && "cursor-not-allowed opacity-60")}
        disabled={disabled || busy}
        onClick={toggle}
      >
        <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", row.suspended ? "translate-x-1" : "translate-x-8")} />
      </button>
      <span className={cn("font-medium", row.suspended ? "text-rose-700" : "text-emerald-700")}>{row.suspended ? t("methodControls.stateSuspended") : t("methodControls.stateActive")}</span>
      {row.suspended && (
        <span className="max-w-[260px] text-right" data-testid="suspension-details">
          <span className="block">{t("methodControls.reasonLabel", { reason: row.reason ?? "—" })}</span>
          <span className="block">{t("methodControls.suspendedByLabel", { by: row.suspendedByName ?? t("methodControls.suspendedBySystem"), at: row.suspendedAt ? formatDate(row.suspendedAt) : "—" })}</span>
          {row.resumeAt && <span className="block">{t("methodControls.resumeAtLabel", { at: formatDate(row.resumeAt) })}</span>}
        </span>
      )}
    </div>
  );
}

function SuspendFields({ valueRef }: { valueRef: MutableRefObject<{ reason: string; resumeAt: string }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [reason, setReason] = useState("");
  const [resumeAt, setResumeAt] = useState("");
  useEffect(() => {
    valueRef.current = { reason, resumeAt };
    update({ confirmDisabled: reason.trim().length === 0 });
  }, [reason, resumeAt, update, valueRef]);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="mc-reason" className="label">
          {t("methodControls.reason")}
        </label>
        <input id="mc-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
      </div>
      <div>
        <label htmlFor="mc-resume" className="label">
          {t("methodControls.resumeAt")}
        </label>
        <input id="mc-resume" type="datetime-local" className="input" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
        <p className="help">{t("methodControls.resumeAtHelp")}</p>
      </div>
    </div>
  );
}

export function PaymentMethodControlsView({ controls }: { controls: MethodControlRow[] }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const canGlobal = useCan("payment_method_control", "suspend_global");
  const canAnnounce = useCan("announcement", "create");
  const [busy, setBusy] = useState<string | null>(null);
  const suspendedCount = controls.filter((c) => c.suspended).length;

  async function afterChange(suspended: boolean, method: string) {
    router.refresh();
    if (!suspended || !canAnnounce) return;
    const label = methodLabel(method, lang);
    const ok = await confirm({ title: t("methodControls.draftTitle"), body: t("methodControls.draftBody", { method: label }), confirmLabel: t("methodControls.draftYes") });
    if (!ok) return;
    const res = await apiJson<{ id: string }>("/api/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "incident", title: t("methodControls.draftAnnouncementTitle", { method: label }), body: t("methodControls.draftAnnouncementBody", { method: label }), publishFrom: "", publishUntil: "", targetAll: true, targetMerchantIds: [], publish: false }),
    });
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    router.push(`/announcements/${res.data.id}`);
  }

  return (
    <div>
      <PageHeader title={t("methodControls.title")} description={t("methodControls.description")} helpHref="/manual/payment-methods" actions={suspendedCount > 0 ? <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{t("methodControls.suspendedCount", { count: suspendedCount })}</span> : undefined} />
      <section className="card" aria-labelledby="global-methods">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 id="global-methods" className="text-sm font-semibold text-slate-800">
            {t("methodControls.globalTitle")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("methodControls.globalHelp")}</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {CONTROLLED_METHODS.map((method) => {
            const row = controls.find((c) => c.method === method)!;
            return (
              <li key={method} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-slate-900">{methodLabel(method, lang)}</p>
                  <p className="mt-1 text-xs text-slate-500">{t(`methodControls.methodHelp.${method}` as never)}</p>
                </div>
                <MethodControlSwitch row={row} scope="global" disabled={!canGlobal} busy={busy === method} onBusy={(b) => setBusy(b ? method : null)} onDone={afterChange} />
              </li>
            );
          })}
        </ul>
        {!canGlobal && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{t("methodControls.globalPermission")}</p>}
      </section>
      <p className="mt-4 text-xs text-slate-500">{t("methodControls.note")}</p>
    </div>
  );
}
