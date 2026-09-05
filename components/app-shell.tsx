"use client";

// Application chrome: top header (search, account, language), grouped
// sidebar (desktop), bottom tab bar (mobile), demo banner, and the
// confirm/toast providers. Navigation comes from lib/nav.ts.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { NavLink } from "./nav-link";
import { WirePayIcon } from "./wire-pay-icon";
import { LanguageToggle } from "./language-toggle";
import { SearchBox } from "./search-box";
import { ModeToggle } from "./mode-provider";
import { AnnouncementBanner, type BannerItem } from "./announcement-banner";
import { MethodBanner } from "./method-banner";
import { NotificationBell } from "./notification-bell";
import { ConfirmProvider } from "./confirm-dialog";
import { ToastProvider } from "./toast";
import { Icon, type IconName } from "./icons";
import { useApiJson, useT } from "./language-provider";
import { useRole, useSession } from "./session-provider";
import { MOBILE_TABS, visibleNavGroups } from "@/lib/nav";
import type { MessageKey } from "@/lib/i18n";

export function AppShell({ children, banner = [], suspendedMethods = [] }: { children: React.ReactNode; banner?: BannerItem[]; suspendedMethods?: string[] }) {
  const t = useT();
  const { can } = useRole();
  const groups = visibleNavGroups(can);
  const pathname = usePathname();

  // Hosted checkout pages (/pay/<token>), the merchant portal (/merchant, own
  // shell in app/merchant/layout.tsx) and the public API docs (/docs) are not
  // operator screens: no admin chrome.
  if (pathname?.startsWith("/pay/") || pathname === "/merchant" || pathname?.startsWith("/merchant/") || pathname?.startsWith("/docs")) {
    return (
      <ConfirmProvider>
        <ToastProvider>
          <div className="min-h-screen bg-slate-50">{children}</div>
        </ToastProvider>
      </ConfirmProvider>
    );
  }

  return (
    <ConfirmProvider>
      <ToastProvider>
        <div className="flex min-h-screen flex-col">
          <MethodBanner methods={suspendedMethods} />
          <AnnouncementBanner items={banner} />
          <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-6 md:py-3">
              <Link href="/" className="flex shrink-0 items-center gap-2 md:invisible md:w-0" aria-label="Wire Pay">
                <WirePayIcon className="h-7 w-7 shrink-0 rounded-md shadow-sm" />
                <span className="text-sm font-semibold text-slate-900 md:hidden">Wire Pay</span>
              </Link>
              <div className="hidden flex-1 justify-center sm:flex">
                <SearchBox />
              </div>
              <div className="flex items-center gap-2">
                {/* On phones the mode / language switches move to the second header row below. */}
                <div className="hidden sm:block">
                  <ModeToggle />
                </div>
                <NotificationBell />
                <AccountMenu />
                <div className="hidden sm:block">
                  <LanguageToggle />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 pb-2 sm:hidden">
              <ModeToggle />
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
              <nav aria-label={t("nav.main")} className="flex-1 overflow-y-auto px-3 py-4 text-sm">
                <NavLink href="/" exact>
                  <Icon name="home" className="h-4 w-4" />
                  <span>{t("nav.dashboard")}</span>
                </NavLink>
                {groups.map((g) => (
                  <div key={g.key} className="mt-3">
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(`nav.groups.${g.key}` as MessageKey)}</p>
                    <div className="space-y-0.5">
                      {g.items.map((item) => (
                        <NavLink key={item.key} href={item.href}>
                          <Icon name={item.icon} className="h-4 w-4" />
                          <span>{t(`nav.items.${item.key}` as MessageKey)}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
              <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
                <p className="font-medium text-slate-700">{t("nav.demoMode")}</p>
                <p className="mt-1">{t("nav.demoModeNote")}</p>
              </div>
            </aside>

            <main className="min-w-0 flex-1">
              <div className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-600 md:hidden">
                <span className="font-medium text-slate-700">{t("nav.demoMode")}</span> — {t("nav.demoModeNote")}
              </div>
              <div className="px-4 pt-3 sm:hidden">
                <SearchBox id="global-search-mobile" />
              </div>
              <div className="mx-auto max-w-6xl px-4 py-8 pb-24 md:px-8 md:pb-8">{children}</div>
            </main>
          </div>

          <nav aria-label={t("nav.main")} className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
            {MOBILE_TABS.map((tab) => (
              <TabLink key={tab.key} href={tab.href} exact={tab.exact} label={t(`nav.tabs.${tab.key}` as MessageKey)} icon={tab.icon} />
            ))}
          </nav>
        </div>
      </ToastProvider>
    </ConfirmProvider>
  );
}

function AccountMenu() {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  if (!user) {
    return (
      <Link href="/login" className="btn-secondary px-3 py-1.5 text-xs">
        {t("nav.login")}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Link href="/account" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100" title={t("nav.account")}>
        <Icon name="user" className="h-4 w-4 text-slate-500" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{user.name}</span>
        <span className="badge max-w-[7rem] truncate bg-slate-800 text-white ring-slate-700">{t(`role.${user.role}`)}</span>
      </Link>
      <button
        type="button"
        className="btn-secondary px-2.5 py-1.5 text-xs"
        disabled={busy}
        aria-label={t("nav.logout")}
        title={t("nav.logout")}
        onClick={async () => {
          setBusy(true);
          await apiJson("/api/auth/logout", { method: "POST" });
          setBusy(false);
          router.push("/login");
          router.refresh();
        }}
      >
        <Icon name="logout" className="h-4 w-4" />
      </button>
    </div>
  );
}

function TabLink({ href, exact, label, icon }: { href: string; exact?: boolean; label: string; icon: IconName }) {
  return (
    <NavLink href={href} exact={exact} className="flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium" activeClassName="text-brand-700" inactiveClassName="text-slate-500">
      <Icon name={icon} className="h-5 w-5" />
      <span>{label}</span>
    </NavLink>
  );
}
