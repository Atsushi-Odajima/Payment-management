"use client";

// Merchant detail → "Payment methods" tab (Phase I-3): the merchant's own
// suspension switches next to the global ones and the enabled-method list.
// Suspending needs a reason; admin and cs may flip merchant switches.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MethodControlSwitch } from "@/components/views/payment-method-controls-view";
import { useLang, useT } from "@/components/language-provider";
import { useCan } from "@/components/session-provider";
import { CONTROLLED_METHODS, type MethodControlRow } from "@/lib/payments/method-control-types";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function MethodsTab({ merchantId, enabledMethods, controls }: { merchantId: string; enabledMethods: string[]; controls: { global: MethodControlRow[]; merchant: MethodControlRow[] } }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const canSuspend = useCan("payment_method_control", "suspend_merchant");
  const [busy, setBusy] = useState<string | null>(null);
  const label = (m: string) => {
    const c = CATEGORIES.find((x) => x.key === m);
    return c ? pickText(c.label, lang) : m;
  };

  return (
    <div className="space-y-6">
      <section className="card" aria-labelledby="methods-heading">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 id="methods-heading" className="text-sm font-semibold text-slate-800">
            {t("methodControls.merchantTitle")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("methodControls.merchantHelp")}</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {CONTROLLED_METHODS.map((method) => {
            const g = controls.global.find((c) => c.method === method);
            const m = controls.merchant.find((c) => c.method === method)!;
            const enabled = enabledMethods.includes(method);
            const available = enabled && !g?.suspended && !m.suspended;
            return (
              <li key={method} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {label(method)}
                    <span className={cn("badge", available ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-rose-100 text-rose-800 ring-rose-200")}>{available ? t("methodControls.available") : t("methodControls.unavailable")}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {!enabled && <span className="mr-2">{t("methodControls.notEnabled")}</span>}
                    {g?.suspended && <span className="mr-2 text-rose-700">{t("methodControls.globalSuspended", { reason: g.reason ?? "" })}</span>}
                  </p>
                </div>
                <MethodControlSwitch row={m} scope="merchant" merchantId={merchantId} disabled={!canSuspend} busy={busy === method} onBusy={(b) => setBusy(b ? method : null)} onDone={() => router.refresh()} />
              </li>
            );
          })}
        </ul>
        {!canSuspend && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{t("methodControls.merchantPermission")}</p>}
      </section>
    </div>
  );
}
