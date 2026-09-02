// Stripe-compatible webhook signatures: header "t=<unix>,v1=<hex hmac>".
// The HMAC-SHA256 is computed over `${timestamp}.${rawBody}` with the
// provider's webhook secret. Verification is constant-time and rejects
// timestamps outside the tolerance window to blunt replay attacks.

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_TOLERANCE_SEC = 300;

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): string {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "malformed" | "expired" | "mismatch" };

export function verifyWebhookSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  opts: { toleranceSec?: number; now?: number } = {},
): VerifyResult {
  if (!header) return { ok: false, reason: "malformed" };
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) {
    return { ok: false, reason: "malformed" };
  }
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  if (Math.abs(now - t) > tolerance) return { ok: false, reason: "expired" };

  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest();
  const given = Buffer.from(v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}
