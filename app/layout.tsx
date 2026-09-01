import "./globals.css";
import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/components/language-provider";
import { AppShell } from "@/components/app-shell";

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
    // suppressHydrationWarning: the lang attribute is switched client-side
    // by LanguageProvider once the stored language is known.
    <html lang="ja" suppressHydrationWarning>
      <body>
        <LanguageProvider>
          <AppShell>{children}</AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
