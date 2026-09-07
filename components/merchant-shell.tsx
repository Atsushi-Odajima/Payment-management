"use client";

// Merchant portal chrome (Phase L-2): its own header (brand, test / live
// switch, language, logout) and navigation, independent of the operator
// sidebar. Rendered by app/merchant/layout.tsx; the login page gets the
// header only.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NavLink } from "./nav-link";
import { WirePayIcon } from "./wire-pay-icon";
import { LanguageToggle } from "./language-toggle";
import { ModeToggle, useMode } from "./mode-provider";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { useApiJson, useT } from "./language-provider";
import { MERCHANT_NAV } from "@/lib/merchant-portal/nav";

export interface MerchantShellUser {
  id: string;
  merchantCode: string;
  siteName: string;
}

export function MerchantShell({ merchant, children, showAdminLink = false }: { merchant: MerchantShellUser | null; children: React.ReactNode; showAdminLink?: boolean }) {
  const t = useT();
  const { mode } = useMode();
  const live = mode === "live";
  const router = useRouter();
  const apiJson = useApiJson();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {live && (
        <div className="flex items-center gap-2 bg-rose-600 px-4 py-1 text-xs font-semibold text-white md:px-6" role="status" data-testid="live-stripe">
          <span className="rounded bg-white/20 px-1.5 py-0.5">{t("mode.liveLabel")}</span>
          <span>{t("mode.liveStripe")}</span>
        </div>
      )}
      <header className={cn("border-b border-slate-200 bg-white", live && "border-l-4 border-l-rose-600")}>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-6 md:py-3">
          <Link href="/merchant" className="flex items-center gap-2" aria-label="Wire Pay">
            <WirePayIcon className="h-7 w-7 shrink-0 rounded-md shadow-sm" />
            <span className="text-sm font-semibold text-slate-900">Wire Pay</span>
            <span className="hidden text-xs text-slate-500 sm:inline">· {t("merchantPortal.title")}</span>
          </Link>
          <div className="flex items-center gap-2">
            {/* On phones the mode / language switches move to the second header row below. */}
            {merchant && (
              <div className="hidden sm:block">
                <ModeToggle />
              </div>
            )}
            <Link href="/docs/api" className="btn-secondary hidden px-3 py-1.5 text-xs sm:inline-flex">
              {t("merchantPortal.docsLink")}
            </Link>
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
            {merchant && (
              <button
                type="button"
                className="btn-secondary px-2.5 py-1.5 text-xs"
                disabled={busy}
                aria-label={t("merchantPortal.logout")}
                title={t("merchantPortal.logout")}
                onClick={async () => {
                  setBusy(true);
                  await apiJson("/api/merchant-portal/logout", { method: "POST" });
                  setBusy(false);
                  router.push("/merchant/login");
                  router.refresh();
                }}
              >
                <Icon name="logout" className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 pb-2 sm:hidden">
          {merchant ? <ModeToggle /> : <span />}
          <LanguageToggle />
        </div>
      </header>
      {merchant ? (
        <div className="flex flex-1">
          <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="truncate text-sm font-semibold text-slate-900">{merchant.siteName}</p>
              <p className="font-mono text-xs text-slate-500">{merchant.merchantCode}</p>
            </div>
            <nav aria-label={t("merchantPortal.title")} className="flex-1 space-y-0.5 px-3 py-4 text-sm">
              {MERCHANT_NAV.map((item) => (
                <NavLink key={item.key} href={item.href} exact={item.exact}>
                  <Icon name={item.icon} className="h-4 w-4" />
                  <span>{t(`merchantPortal.nav.${item.key}`)}</span>
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
              <p>{t("merchantPortal.modeHelp")}</p>
              {showAdminLink && (
                <Link href="/" className="mt-2 inline-block text-brand-700 hover:underline">
                  {t("merchantPortal.adminLink")} →
                </Link>
              )}
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <nav aria-label={t("merchantPortal.title")} className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 text-xs md:hidden">
              {MERCHANT_NAV.map((item) => (
                <NavLink key={item.key} href={item.href} exact={item.exact} className="whitespace-nowrap rounded-md px-3 py-1.5" activeClassName="bg-brand-600 text-white" inactiveClassName="text-slate-600">
                  {t(`merchantPortal.nav.${item.key}`)}
                </NavLink>
              ))}
            </nav>
            <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
          </main>
        </div>
      ) : (
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">{children}</main>
      )}
    </div>
  );
}
