"use client";

import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { methodLabel } from "@/components/views/transactions-view";
import { CONTROLLED_METHODS, type MethodControlRow } from "@/lib/payments/method-control-types";
import type { PaymentMethod } from "@/lib/payments/methods";

export function MerchantMethodsView({ enabled, global, merchant }: { enabled: PaymentMethod[]; global: MethodControlRow[]; merchant: MethodControlRow[] }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.methods.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.methods.description")}</p>
      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">{t("merchantPortal.methods.thMethod")}</th>
              <th className="px-5 py-3">{t("merchantPortal.methods.thStatus")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {CONTROLLED_METHODS.map((m) => {
              const g = global.find((c) => c.method === m && c.suspended);
              const own = merchant.find((c) => c.method === m && c.suspended);
              const isEnabled = enabled.includes(m);
              const row = g ?? own;
              return (
                <tr key={m}>
                  <td className="px-5 py-3 text-slate-800">{methodLabel(m, lang)}</td>
                  <td className="px-5 py-3">
                    {!isEnabled ? (
                      <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{t("merchantPortal.methods.notEnabled")}</span>
                    ) : row ? (
                      <div>
                        <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{g ? t("merchantPortal.methods.suspendedGlobal") : t("merchantPortal.methods.suspendedMerchant")}</span>
                        {row.reason && <p className="mt-1 text-xs text-slate-500">{t("merchantPortal.methods.reason", { reason: row.reason })}</p>}
                        {row.resumeAt && <p className="text-xs text-slate-500">{t("merchantPortal.methods.resumeAt", { at: formatDate(row.resumeAt) })}</p>}
                      </div>
                    ) : (
                      <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">{t("merchantPortal.methods.available")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
