// Server Component shown instead of the app when the caller's IP matches an
// enabled admin "deny" rule. Deliberately free of client providers so a
// blocked visitor loads nothing but this message.

import { translate, type Lang } from "@/lib/i18n";
import { WirePayIcon } from "@/components/wire-pay-icon";

export function BlockedScreen({ lang, ip, matched, reason = "deny" }: { lang: Lang; ip: string; matched: string; reason?: "deny" | "not_in_allowlist" }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
          <WirePayIcon className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{translate(lang, "pages.blockedTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">{translate(lang, reason === "not_in_allowlist" ? "pages.blockedBodyAllowlist" : "pages.blockedBody")}</p>
        <dl className="mt-5 space-y-1 rounded-lg bg-slate-100 px-4 py-3 text-left font-mono text-xs text-slate-700">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{translate(lang, "pages.blockedIp")}</dt>
            <dd>{ip}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{translate(lang, "pages.blockedRule")}</dt>
            <dd>{reason === "not_in_allowlist" ? translate(lang, "pages.blockedNotInAllowlist") : matched}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
