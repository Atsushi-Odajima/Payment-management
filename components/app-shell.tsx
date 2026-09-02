"use client";

// Application chrome: top header (all sizes), sidebar (desktop), bottom tab
// bar (mobile), demo / auth banners, and the confirm-dialog provider.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NavLink } from "./nav-link";
import { WirePayIcon } from "./wire-pay-icon";
import { LanguageToggle } from "./language-toggle";
import { ConfirmProvider } from "./confirm-dialog";
import { ToastProvider } from "./toast";
import { useApiJson, useT } from "./language-provider";

export interface AppShellProps {
  children: React.ReactNode;
  /** ADMIN_PASSWORD is configured (mutations require login). */
  authConfigured: boolean;
  /** The current request carries a valid session cookie. */
  authenticated: boolean;
}

export function AppShell({ children, authConfigured, authenticated }: AppShellProps) {
  const t = useT();
  return (
    <ConfirmProvider>
      <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
          <Link href="/" className="flex items-center gap-2 md:invisible" aria-label="Wire Pay">
            <WirePayIcon className="h-7 w-7 shrink-0 rounded-md shadow-sm" />
            <span className="text-sm font-semibold text-slate-900">Wire Pay</span>
          </Link>
          <div className="flex items-center gap-2">
            <AuthControl configured={authConfigured} authenticated={authenticated} />
            <LanguageToggle />
          </div>
        </header>

        <div className="flex flex-1">
          <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
            <div className="border-b border-slate-200 px-6 py-5">
              <Link href="/" className="flex items-center gap-2">
                <WirePayIcon className="h-8 w-8 shrink-0 rounded-lg shadow" />
                <span className="text-sm font-semibold text-slate-900">Wire Pay</span>
              </Link>
              <p className="mt-1 text-xs text-slate-500">{t("brand.tagline")}</p>
            </div>
            <nav aria-label={t("nav.main")} className="flex-1 space-y-1 px-3 py-4 text-sm">
              <NavLink href="/" exact>
                <span>{t("nav.dashboard")}</span>
              </NavLink>
              <NavLink href="/providers">
                <span>{t("nav.providers")}</span>
              </NavLink>
              <NavLink href="/providers/new">
                <span>{t("nav.newProvider")}</span>
              </NavLink>
              <NavLink href="/merchants">
                <span>{t("nav.merchants")}</span>
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

          <main className="min-w-0 flex-1">
            {!authConfigured && (
              <div
                role="note"
                className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 md:px-8"
              >
                {t("nav.authUnconfigured")}
              </div>
            )}
            <div className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-600 md:hidden">
              <span className="font-medium text-slate-700">{t("nav.demoMode")}</span> — {t("nav.demoModeNote")}
            </div>
            <div className="mx-auto max-w-6xl px-4 py-8 pb-24 md:px-8 md:pb-8">{children}</div>
          </main>
        </div>

        <nav
          aria-label={t("nav.main")}
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
        >
          <TabLink href="/" exact label={t("nav.tabDashboard")} icon="home" />
          <TabLink href="/providers" label={t("nav.tabProviders")} icon="plug" />
          <TabLink href="/merchants" label={t("nav.tabMerchants")} icon="store" />
          <TabLink href="/payments" label={t("nav.tabPayments")} icon="list" />
          <TabLink href="/payments/new" label={t("nav.tabCreate")} icon="plus" />
        </nav>
      </div>
      </ToastProvider>
    </ConfirmProvider>
  );
}

function AuthControl({ configured, authenticated }: { configured: boolean; authenticated: boolean }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const [busy, setBusy] = useState(false);
  if (!configured) return null;
  if (!authenticated) {
    return (
      <Link href="/login" className="btn-secondary px-3 py-1.5 text-xs">
        {t("nav.login")}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="btn-secondary px-3 py-1.5 text-xs"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await apiJson("/api/auth/logout", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
    >
      {t("nav.logout")}
    </button>
  );
}

function TabLink({
  href,
  exact,
  label,
  icon,
}: {
  href: string;
  exact?: boolean;
  label: string;
  icon: "home" | "plug" | "store" | "list" | "plus";
}) {
  return (
    <NavLink
      href={href}
      exact={exact}
      className="flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium"
      activeClassName="text-brand-700"
      inactiveClassName="text-slate-500"
    >
      <TabIcon name={icon} />
      <span>{label}</span>
    </NavLink>
  );
}

function TabIcon({ name }: { name: "home" | "plug" | "store" | "list" | "plus" }) {
  const props = {
    viewBox: "0 0 24 24",
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M3 11l9-7 9 7M5 10v10h14V10" />
        </svg>
      );
    case "plug":
      return (
        <svg {...props}>
          <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0V8zM12 17v4" />
        </svg>
      );
    case "store":
      return (
        <svg {...props}>
          <path d="M3 8l1.5-4h15L21 8M3 8v11h18V8M3 8h18M9 12h6" />
        </svg>
      );
    case "list":
      return (
        <svg {...props}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
  }
}
