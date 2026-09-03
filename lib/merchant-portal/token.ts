// Merchant portal session token (Phase L-2). A separate cookie from the
// operator session: different name, different HMAC key derivation, its own
// purpose tag, so a merchant cookie can never be read as an admin session
// (and vice versa). Web Crypto only — the Edge middleware verifies it too.

export const MERCHANT_COOKIE = "wirepay.merchant";
export const MERCHANT_SESSION_TTL_SEC = 60 * 60 * 12; // 12 hours

function secretMaterial(): string {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) throw new Error("SESSION_SECRET (or ENCRYPTION_KEY) must be set to sign merchant sessions");
  return s;
}

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(`wirepay-merchant-session:${secretMaterial()}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
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

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export interface MerchantSessionPayload {
  /** Merchant id. */
  sub: string;
  purpose: "merchant";
  exp: number;
}

export async function createMerchantToken(merchantId: string, now: number = Math.floor(Date.now() / 1000), ttlSec: number = MERCHANT_SESSION_TTL_SEC): Promise<string> {
  const payload: MerchantSessionPayload = { sub: merchantId, purpose: "merchant", exp: now + ttlSec };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Signature + expiry + purpose check (Edge-safe). Route handlers also re-read the merchant row. */
export async function verifyMerchantToken(token: string | undefined | null, now: number = Math.floor(Date.now() / 1000)): Promise<MerchantSessionPayload | null> {
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
  if (!equalBytes(expected, given)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Partial<MerchantSessionPayload>;
    if (typeof p.sub !== "string" || p.purpose !== "merchant" || typeof p.exp !== "number" || p.exp <= now) return null;
    return p as MerchantSessionPayload;
  } catch {
    return null;
  }
}

export function merchantCookieAttributes(maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
