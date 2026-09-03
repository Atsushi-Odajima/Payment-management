import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { LanguageProvider } from "@/components/language-provider";
import { SessionProvider } from "@/components/session-provider";
import { ModeProvider } from "@/components/mode-provider";
import { AppShell } from "@/components/app-shell";
import { BlockedScreen } from "@/components/blocked-screen";
import { LANG_COOKIE, resolveInitialLang, translate, type Lang } from "@/lib/i18n";
import { SESSION_COOKIE } from "@/lib/auth";
import { currentAdminFromToken } from "@/lib/admin/current";
import { checkAdminAccess } from "@/lib/ip-restrictions/enforce";
import { MODE_COOKIE, resolveMode } from "@/lib/mode";

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

  // Admin IP block list (IP制限管理): an enabled "deny" rule matching the
  // caller replaces every page with the blocked screen. API routes apply the
  // same check in lib/api/handler.ts.
  const h = headers();
  const access = await checkAdminAccess((n) => h.get(n));
  if (access.blocked) {
    return (
      <html lang={lang}>
        <body>
          <BlockedScreen lang={lang} ip={access.ip ?? ""} matched={access.matched ?? ""} />
        </body>
      </html>
    );
  }

  // The signed-in operator (null when browsing anonymously). Role and
  // identity flow to client components through SessionProvider.
  const user = await currentAdminFromToken(cookies().get(SESSION_COOKIE)?.value);
  const mode = resolveMode(cookies().get(MODE_COOKIE)?.value);
  return (
    <html lang={lang}>
      <body>
        <LanguageProvider initialLang={lang}>
          <SessionProvider user={user}>
            <ModeProvider initialMode={mode}>
              <AppShell>{children}</AppShell>
            </ModeProvider>
          </SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
