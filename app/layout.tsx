import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { LanguageProvider } from "@/components/language-provider";
import { AppShell } from "@/components/app-shell";
import { LANG_COOKIE, resolveInitialLang, translate, type Lang } from "@/lib/i18n";
import { SESSION_COOKIE, isAuthConfigured, verifySessionToken } from "@/lib/auth";
import { RoleProvider } from "@/components/role-provider";
import { ROLE_COOKIE, resolveRole } from "@/lib/role";

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
  const role = resolveRole(cookies().get(ROLE_COOKIE)?.value);
  return (
    <html lang={lang}>
      <body>
        <LanguageProvider initialLang={lang}>
          <RoleProvider initialRole={role}>
            <AppShell authConfigured={isAuthConfigured()} authenticated={authenticated}>
              {children}
            </AppShell>
          </RoleProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
