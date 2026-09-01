"use client";

// Application chrome: sidebar (desktop), top header (all sizes) with the
// language toggle, and the main content area. Client component so all nav
// labels react to the selected language.

import Link from "next/link";
import { NavLink } from "./nav-link";
import { WirePayIcon } from "./wire-pay-icon";
import { LanguageToggle } from "./language-toggle";
import { useT } from "./language-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="border-b border-slate-200 px-6 py-5">
          <Link href="/" className="flex items-center gap-2">
            <WirePayIcon
              className="h-8 w-8 shrink-0 rounded-lg shadow"
              title="Wire Pay(黒)"
            />
            <span className="text-sm font-semibold text-slate-900">Wire Pay(黒)</span>
          </Link>
          <p className="mt-1 text-xs text-slate-500">{t("brand.tagline")}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          <NavLink href="/" exact>
            <span>{t("nav.dashboard")}</span>
          </NavLink>
          <NavLink href="/providers">
            <span>{t("nav.providers")}</span>
          </NavLink>
          <NavLink href="/providers/new">
            <span>{t("nav.newProvider")}</span>
          </NavLink>
          <NavLink href="/payments">
            <span>{t("nav.payments")}</span>
          </NavLink>
          <NavLink href="/payments/new">
            <span>{t("nav.newPayment")}</span>
          </NavLink>
        </nav>
        <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
          <p className="font-medium text-slate-700">{t("nav.demoMode")}</p>
          <p className="mt-1">{t("nav.demoModeNote")}</p>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 md:invisible">
            <WirePayIcon
              className="h-7 w-7 shrink-0 rounded-md shadow-sm"
              title="Wire Pay(黒)"
            />
            <span className="text-sm font-semibold text-slate-900">Wire Pay(黒)</span>
          </Link>
          <LanguageToggle />
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
