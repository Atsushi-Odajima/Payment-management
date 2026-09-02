"use client";

// Live preview of the payment-result notification a merchant will receive,
// derived from the three notification selectors. Written for the developer
// on the merchant side: exact request line, headers, body, a parameter
// reference, signature rules and a curl reproduction.

import { useState } from "react";
import { useT } from "./language-provider";
import { buildNotificationSample, toCurl, type NotificationConfig } from "@/lib/merchants/notification";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const GROUP_CLASS = {
  id: "bg-blue-100 text-blue-800",
  minimal: "bg-slate-100 text-slate-700",
  standard: "bg-emerald-100 text-emerald-800",
  full: "bg-violet-100 text-violet-800",
} as const;

export function NotificationPreview({
  config,
  merchantCode,
}: {
  config: NotificationConfig;
  merchantCode: string;
}) {
  const t = useT();
  const [showCurl, setShowCurl] = useState(false);
  const sample = buildNotificationSample(config, merchantCode);

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{t("notifyPreview.title")}</h3>
        <p className="text-xs text-slate-500">{t("notifyPreview.subtitle")}</p>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("notifyPreview.request")}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
            <span className="font-semibold text-brand-700">{sample.method}</span> {sample.url}
          </pre>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("notifyPreview.headers")}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
            {Object.entries(sample.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
          </pre>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("notifyPreview.body")}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
            {sample.body ?? t("notifyPreview.noBody")}
          </pre>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("notifyPreview.params")}
          </p>
          <div className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">{t("notifyPreview.thName")}</th>
                  <th scope="col" className="px-3 py-2">{t("notifyPreview.thSample")}</th>
                  <th scope="col" className="px-3 py-2">{t("notifyPreview.thDescription")}</th>
                  <th scope="col" className="px-3 py-2">{t("notifyPreview.thGroup")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sample.params.map((p) => (
                  <tr key={p.name}>
                    <td className="px-3 py-2 font-mono text-slate-800">{p.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{p.value}</td>
                    <td className="px-3 py-2 text-slate-600">{t(paramDescriptionKey(p.name))}</td>
                    <td className="px-3 py-2">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", GROUP_CLASS[p.group])}>
                        {t(`notifyPreview.group_${p.group}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">{t("notifyPreview.signatureTitle")}</p>
          <p className="mt-1">{t("notifyPreview.signatureBody")}</p>
          <p className="mt-1">{t("notifyPreview.retryBody")}</p>
        </div>

        <div>
          <button
            type="button"
            className="text-xs font-medium text-brand-700 hover:underline"
            onClick={() => setShowCurl((v) => !v)}
            aria-expanded={showCurl}
          >
            {showCurl ? t("notifyPreview.hideCurl") : t("notifyPreview.showCurl")}
          </button>
          {showCurl && (
            <pre className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
              {toCurl(sample)}
            </pre>
          )}
        </div>
      </div>
    </section>
  );
}

function paramDescriptionKey(name: string): MessageKey {
  switch (name) {
    case "payment_id":
      return "notifyParams.payment_id";
    case "transaction_id":
      return "notifyParams.transaction_id";
    case "merchant_id":
      return "notifyParams.merchant_id";
    case "amount":
      return "notifyParams.amount";
    case "currency":
      return "notifyParams.currency";
    case "paid_at":
      return "notifyParams.paid_at";
    case "status":
      return "notifyParams.status";
    case "payment_method":
      return "notifyParams.payment_method";
    case "user_id":
      return "notifyParams.user_id";
    case "product_id":
      return "notifyParams.product_id";
    default:
      return "notifyParams.domain";
  }
}
