// Edge middleware guarding every /api/* mutation.
//
// Order of checks for non-GET requests:
//   1. rate limit (per IP, best-effort — see lib/rate-limit.ts)
//   2. CSRF: same-origin Origin/Referer + X-Requested-With: fetch
//   3. DEMO_READONLY: refuse destructive operations on the public demo
//   4. session cookie (signature + expiry; route handlers re-check the user)
//
// Reads (GET/HEAD) stay public so the demo can be browsed without logging in.
// Webhooks authenticate with an HMAC signature, the demo reset endpoint with
// CRON_SECRET and the bank deposit notification with DEPOSIT_NOTIFY_SECRET,
// so they bypass the session check. Admin IP blocking needs the database and
// therefore lives in app/layout.tsx and lib/api/handler.ts, not here.

import { NextResponse, type NextRequest } from "next/server";
import { isLang, type Lang } from "@/lib/i18n";
import { failResponse } from "@/lib/api/envelope";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoReadonly } from "@/lib/demo";

export const config = {
  matcher: ["/api/:path*"],
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Own authentication: PSP webhook signatures, merchant API keys.
const SIGNATURE_AUTH_PREFIXES = ["/api/webhooks/", "/api/merchant-api/"];
// Bearer secrets: cron / demo endpoints.
const SECRET_AUTH_PATHS = ["/api/demo/reset", "/api/demo/deposit-notify", "/api/demo/cvs-notify", "/api/cron/expire-transfers", "/api/cron/webhook-retry", "/api/cron/subscriptions"];
// Public demo endpoints without authentication (the webhook receiver is only an echo).
const PUBLIC_PATHS = ["/api/demo/webhook-receiver"];
// Hosted checkout (payment links): public, CSRF-protected by the same-origin rules below.
const PUBLIC_PREFIXES = ["/api/pay/"];
// The two login steps authenticate by themselves (password / 2FA token).
const LOGIN_PATHS = ["/api/auth/login", "/api/auth/2fa"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const lang: Lang = (() => {
    const v = req.headers.get("x-lang");
    return isLang(v) ? v : "ja";
  })();

  // Endpoints with their own authentication scheme.
  if (
    SIGNATURE_AUTH_PREFIXES.some((p) => pathname.startsWith(p)) ||
    SECRET_AUTH_PATHS.includes(pathname) ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next();
  }

  if (SAFE_METHODS.has(req.method)) return NextResponse.next();
  const publicCheckout = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // 1. Rate limit
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const isLogin = LOGIN_PATHS.includes(pathname);
  const rl = rateLimit(`${isLogin ? "login" : "mutate"}:${ip}`, {
    limit: isLogin ? 10 : 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return failResponse(lang, 429, "rate_limited", "errors.rateLimited", undefined, {
      "retry-after": String(rl.retryAfterSec),
    });
  }

  // 2. CSRF — browsers always send Origin on cross-site POSTs; our own fetch
  //    wrapper adds X-Requested-With as a second, cheap signal.
  const origin = req.headers.get("origin") ?? refererOrigin(req.headers.get("referer"));
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return failResponse(lang, 403, "csrf_origin", "errors.forbidden");
  }
  if (req.headers.get("x-requested-with") !== "fetch") {
    return failResponse(lang, 403, "csrf_header", "errors.forbidden");
  }

  if (isLogin || publicCheckout) return NextResponse.next();

  // 3. Demo read-only mode
  if (isDemoReadonly()) {
    const destructive =
      req.method === "DELETE" ||
      (req.method === "PATCH" && pathname.startsWith("/api/providers/"));
    if (destructive) {
      return failResponse(lang, 403, "demo_readonly", "errors.demoReadonly");
    }
  }

  // 4. Session
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token))) {
    return failResponse(lang, 401, "unauthorized", "errors.unauthorized");
  }

  return NextResponse.next();
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
