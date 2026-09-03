// Merchant portal sessions (Phase L-2): login with merchant code + password
// (the merchant password kept encrypted since Phase 加盟店), lockout after
// repeated failures, the current-merchant resolver used by pages and
// portal routes, and logout. Every login / lockout is audited with the
// merchant as the actor. Server only.

import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { merchantAuditContext, recordAudit } from "@/lib/audit";
import { cookieFromHeader } from "@/lib/auth";
import { decryptMerchantPassword } from "@/lib/merchants/secrets";
import { MERCHANT_COOKIE, createMerchantToken, verifyMerchantToken } from "./token";

export const MERCHANT_LOCKOUT_THRESHOLD = 5;
export const MERCHANT_LOCKOUT_MINUTES = 15;

export interface CurrentMerchant {
  id: string;
  merchantCode: string;
  siteName: string;
  companyName: string;
  contactName: string;
  email: string;
  enabledMethods: string;
  lastLoginAt: Date | null;
}

const CURRENT_SELECT = { id: true, merchantCode: true, siteName: true, companyName: true, contactName: true, email: true, enabledMethods: true, lastLoginAt: true } as const;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Verifies the credentials, applies the lockout rule and returns the session token. */
export async function loginMerchant(db: PrismaClient, opts: { merchantCode: string; password: string; ip: string | null; now?: Date }): Promise<{ token: string; merchant: CurrentMerchant }> {
  const now = opts.now ?? new Date();
  const code = opts.merchantCode.trim().toUpperCase();
  const row = await db.merchant.findUnique({ where: { merchantCode: code }, select: { ...CURRENT_SELECT, passwordEnc: true, failedLoginCount: true, lockedUntil: true } });
  if (!row) throw new ApiError(401, "invalid_credentials", "errors.invalidCredentials");
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    throw new ApiError(423, "merchant_locked", "errors.merchantLocked", { minutes: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 60_000) });
  }
  let ok = false;
  try {
    ok = safeEqual(decryptMerchantPassword(row.passwordEnc), opts.password);
  } catch {
    ok = false;
  }
  if (!ok) {
    const failures = (row.lockedUntil ? 0 : row.failedLoginCount) + 1;
    const lock = failures >= MERCHANT_LOCKOUT_THRESHOLD;
    await db.$transaction(async (tx) => {
      await tx.merchant.update({ where: { id: row.id }, data: { failedLoginCount: lock ? 0 : failures, lockedUntil: lock ? new Date(now.getTime() + MERCHANT_LOCKOUT_MINUTES * 60_000) : null } });
      if (lock) await recordAudit(tx, merchantAuditContext(row.id, opts.ip), { action: "merchant.lockout", targetType: "merchant", targetId: row.id, after: { failures, lockedMinutes: MERCHANT_LOCKOUT_MINUTES } });
    });
    if (lock) throw new ApiError(423, "merchant_locked", "errors.merchantLocked", { minutes: MERCHANT_LOCKOUT_MINUTES });
    throw new ApiError(401, "invalid_credentials", "errors.invalidCredentials");
  }
  const merchant = await db.$transaction(async (tx) => {
    const m = await tx.merchant.update({ where: { id: row.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now }, select: CURRENT_SELECT });
    await recordAudit(tx, merchantAuditContext(row.id, opts.ip), { action: "merchant.login", targetType: "merchant", targetId: row.id });
    return m;
  });
  return { token: await createMerchantToken(row.id, Math.floor(now.getTime() / 1000)), merchant };
}

export async function currentMerchantFromToken(db: PrismaClient, token: string | null | undefined): Promise<CurrentMerchant | null> {
  const payload = await verifyMerchantToken(token);
  if (!payload) return null;
  return db.merchant.findUnique({ where: { id: payload.sub }, select: CURRENT_SELECT });
}

/** Route Handlers: the merchant behind the portal cookie, or 401. */
export async function requireMerchant(db: PrismaClient, req: Request): Promise<CurrentMerchant> {
  const m = await currentMerchantFromToken(db, cookieFromHeader(req.headers.get("cookie"), MERCHANT_COOKIE));
  if (!m) throw new ApiError(401, "unauthorized", "errors.unauthorized");
  return m;
}
