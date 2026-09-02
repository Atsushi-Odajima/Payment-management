import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { LanguageProvider } from "@/components/language-provider";
import { AppShell } from "@/components/app-shell";
import { LANG_COOKIE, resolveInitialLang, translate, type Lang } from "@/lib/i18n";
import { SESSION_COOKIE, isAuthConfigured, verifySessionToken } from "@/lib/auth";

function requestLang(): Lang {
  return resolveInitialLang(cookies().get(LANG_COOKIE)?.value, headers().get("accept-language"));
}

export function generateMetadata(): Metadata {
  const lang = requestLang();
  return {
    title: translate(lang, "brand.metaTitle"),
    description: translate(lang, "brand.metaDescription"),
    appleWebApp: {
      capable: true,
      title: "Wire Pay",
      statusBarStyle: "default",
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2667e6",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = requestLang();
  const authenticated = await verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  return (
    <html lang={lang}>
      <body>
        <LanguageProvider initialLang={lang}>
          <AppShell authConfigured={isAuthConfigured()} authenticated={authenticated}>
            {children}
          </AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
