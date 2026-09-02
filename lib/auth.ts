// Minimal admin session for the dashboard.
//
// Design: a single admin password (ADMIN_PASSWORD) unlocks a signed, HttpOnly
// session cookie. The signature is HMAC-SHA256 via Web Crypto so the same code
// runs in the Edge middleware and in Node route handlers. There is no user
// table on purpose — this is a single-tenant demo; swapping in Auth.js later
// only touches this file and middleware.ts.
//
// When ADMIN_PASSWORD is not set, authentication is DISABLED and the UI shows
// a warning banner (see AppShell). This keeps the public demo usable while
// making the unprotected state impossible to miss.

export const SESSION_COOKIE = "wirepay.session";
export const SESSION_TTL_SEC = 60 * 60 * 12; // 12 hours

export function isAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

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

export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return false;
  return timingSafeEqualBytes(enc.encode(input), enc.encode(expected));
}

interface SessionPayload {
  sub: "admin";
  exp: number; // unix seconds
}

export async function createSessionToken(
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: SessionPayload = { sub: "admin", exp: now + SESSION_TTL_SEC };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  now: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  let key: CryptoKey;
  try {
    key = await hmacKey();
  } catch {
    return false;
  }
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  let given: Uint8Array;
  try {
    given = fromB64url(sig);
  } catch {
    return false;
  }
  if (!timingSafeEqualBytes(expected, given)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    return payload.sub === "admin" && typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}

/** Read the session cookie value out of a Cookie header. */
export function sessionFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

export function sessionCookieAttributes(maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
