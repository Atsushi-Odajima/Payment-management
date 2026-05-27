import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { WirePayIcon } from "@/components/wire-pay-icon";

export const metadata: Metadata = {
  title: "Wire Pay(黒) — 決済管理ダッシュボード",
  description:
    "小規模ECストア向けの決済プロバイダ統合ダッシュボード。PayPay・クレジット・コンビニ・銀行振込などを一括管理できます。",
  appleWebApp: {
    capable: true,
    title: "Wire Pay(黒)",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2667e6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
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
              <p className="mt-1 text-xs text-slate-500">決済管理ダッシュボード</p>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
              <NavLink href="/" exact>
                <span>ダッシュボード</span>
              </NavLink>
              <NavLink href="/providers">
                <span>決済プロバイダ</span>
              </NavLink>
              <NavLink href="/providers/new">
                <span>＋ 新規接続</span>
              </NavLink>
              <NavLink href="/payments">
                <span>売上 / 決済一覧</span>
              </NavLink>
              <NavLink href="/payments/new">
                <span>＋ 決済を作成</span>
              </NavLink>
            </nav>
            <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
              <p className="font-medium text-slate-700">デモモード</p>
              <p className="mt-1">外部APIは呼び出さず、ダミーで決済を生成します。</p>
            </div>
          </aside>
          <main className="flex-1 min-w-0">
            <header className="flex items-center gap-2 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur md:hidden">
              <Link href="/" className="flex items-center gap-2">
                <WirePayIcon
                  className="h-7 w-7 shrink-0 rounded-md shadow-sm"
                  title="Wire Pay(黒)"
                />
                <span className="text-sm font-semibold text-slate-900">Wire Pay(黒)</span>
              </Link>
            </header>
            <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
