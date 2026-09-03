// Admin sessions for the dashboard.
//
// Design: a successful login (AdminUser + scrypt password, optionally TOTP)
// issues a signed, HttpOnly session cookie carrying the user id and role.
// The signature is HMAC-SHA256 via Web Crypto so the same code runs in the
// Edge middleware (signature + expiry only) and in Node route handlers, which
// additionally load the user to make sure the account is still active
// (lib/admin/current.ts).
//
// A second, short-lived token bridges the password step and the TOTP step of
// a two-factor login (purpose "2fa"); it is never accepted as a session.

import { LEGACY_ROLE_MAP, isRole, type Role } from "@/lib/role";

export const SESSION_COOKIE = "wirepay.session";
export const SESSION_TTL_SEC = 60 * 60 * 12; // 12 hours
export const TWO_FACTOR_COOKIE = "wirepay.2fa";
export const TWO_FACTOR_TTL_SEC = 5 * 60;

/** HMAC key material: SESSION_SECRET, falling back to ENCRYPTION_KEY. */
function secretMaterial(): string {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) throw new Error("SESSION_SECRET (or ENCRYPTION_KEY) must be set to sign sessions");
  return s;
}

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(`wirepay-session:${secretMaterial()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export type TokenPurpose = "session" | "2fa";

export interface SessionPayload {
  /** AdminUser id. */
  sub: string;
  role: Role;
  purpose: TokenPurpose;
  exp: number; // unix seconds
}

async function sign(payload: SessionPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

async function verify(token: string | undefined | null, now: number): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let key: CryptoKey;
  try {
    key = await hmacKey();
  } catch {
    return null;
  }
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  let given: Uint8Array;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  if (!timingSafeEqualBytes(expected, given)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Partial<SessionPayload>;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || payload.exp <= now) return null;
    // Current or legacy (pre-Phase-I) role names; the user row is re-read anyway.
    if (!isRole(payload.role) && !(typeof payload.role === "string" && payload.role in LEGACY_ROLE_MAP)) return null;
    if (payload.purpose !== "session" && payload.purpose !== "2fa") return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSessionToken(
  user: { id: string; role: Role },
  now: number = Math.floor(Date.now() / 1000),
  ttlSec: number = SESSION_TTL_SEC,
): Promise<string> {
  return sign({ sub: user.id, role: user.role, purpose: "session", exp: now + ttlSec });
}

/** Signature + expiry check only (Edge-safe). Route handlers also check the user row. */
export async function verifySessionToken(
  token: string | undefined | null,
  now: number = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  const p = await verify(token, now);
  return p && p.purpose === "session" ? p : null;
}

/** Token issued after a correct password when the user has TOTP enabled. */
export async function createTwoFactorToken(
  user: { id: string; role: Role },
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return sign({ sub: user.id, role: user.role, purpose: "2fa", exp: now + TWO_FACTOR_TTL_SEC });
}

export async function verifyTwoFactorToken(
  token: string | undefined | null,
  now: number = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  const p = await verify(token, now);
  return p && p.purpose === "2fa" ? p : null;
}

/** Read a cookie value out of a Cookie header. */
export function cookieFromHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** Read the session cookie value out of a Cookie header. */
export function sessionFromCookieHeader(cookieHeader: string | null): string | null {
  return cookieFromHeader(cookieHeader, SESSION_COOKIE);
}

export function sessionCookieAttributes(maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
