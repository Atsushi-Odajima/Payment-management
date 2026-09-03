// Signed download links for customers (Phase K-2). The hosted payment page
// has no session of its own: after a link checkout completes, the customer
// receives a URL that carries an HMAC over (link token, payment id, expiry).
// The admin session is never involved, and the link only ever resolves the
// one transaction it was minted for.

import { createHmac, timingSafeEqual } from "node:crypto";

export const CUSTOMER_RECEIPT_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) throw new Error("SESSION_SECRET (or ENCRYPTION_KEY) must be set to sign receipt links");
  return s;
}

function sign(linkToken: string, paymentId: string, exp: number): string {
  return createHmac("sha256", `wirepay-receipt:${secret()}`).update(`${linkToken}.${paymentId}.${exp}`).digest("base64url");
}

/** `/api/pay/<token>/receipt?p=<paymentId>&e=<exp>&s=<sig>` — relative so the page can prefix its own origin. */
export async function customerReceiptPath(linkToken: string, paymentId: string, now: number = Math.floor(Date.now() / 1000)): Promise<string> {
  const exp = now + CUSTOMER_RECEIPT_TTL_SEC;
  const q = new URLSearchParams({ p: paymentId, e: String(exp), s: sign(linkToken, paymentId, exp) });
  return `/api/pay/${linkToken}/receipt?${q.toString()}`;
}

/** Returns the payment id when the signature and expiry check out, else null. */
export function verifyCustomerReceiptQuery(linkToken: string, q: { p: string | null; e: string | null; s: string | null }, now: number = Math.floor(Date.now() / 1000)): string | null {
  if (!q.p || !q.e || !q.s || !/^\d+$/.test(q.e)) return null;
  const exp = Number(q.e);
  if (exp <= now) return null;
  const expected = Buffer.from(sign(linkToken, q.p, exp));
  const given = Buffer.from(q.s);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return q.p;
}
