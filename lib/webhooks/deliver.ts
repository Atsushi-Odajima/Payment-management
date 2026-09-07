// Outbound merchant webhooks (Phase E): build the request from the merchant's
// notification settings, sign it, deliver with a 10 s timeout, record every
// attempt and schedule retries with exponential backoff.
//
//   enqueueWebhook()  – creates a pending WebhookDelivery (inside the caller's
//                       transaction when a tx is passed)
//   attemptDelivery() – one HTTP try; updates status / nextRetryAt
//   emitPaymentWebhook() – enqueue + first attempt (skipped under tests)
//   processDueRetries() – cron entry point
//
// Signature: X-Signature: v1=<HMAC-SHA256(secret, "<timestamp>.<payload>")>
// and X-Timestamp: <unix seconds>; payload = body (POST) or query string
// (GET). The secret is the merchant's newest usable signing secret of the
// payment's mode. Without one the delivery is NOT sent (fail closed, Phase
// P1-4): it is recorded as failed with error signing_secret_missing and the
// operators are warned once a day per merchant × mode.

import { createHmac } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { emitNotification } from "@/lib/notifications/emit";
import { buildNotificationRequest, signatureHeaders, type NotificationValues } from "@/lib/merchants/notification";
import { isNotifyFormat, isNotifyIdFormat, isNotifyParamSet } from "@/lib/merchants/types";
import { decryptSigningSecret } from "@/lib/merchants/secrets";
import { apiKeyUsable } from "@/lib/merchants/api-keys";
import type { MerchantWebhookEvent } from "./events";

type Db = PrismaClient | Prisma.TransactionClient;

import { MAX_ATTEMPTS, RETRY_DELAYS_MS, WEBHOOK_TIMEOUT_MS, type WebhookStatus } from "./status";

export { MAX_ATTEMPTS, RETRY_DELAYS_MS, WEBHOOK_TIMEOUT_MS, WEBHOOK_STATUSES, isWebhookStatus, type WebhookStatus } from "./status";
export const RESPONSE_BODY_LIMIT = 1024;

/** Next retry time after `attempts` failures, or null when exhausted. */
export function nextRetryAt(attempts: number, now: Date = new Date()): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ?? RETRY_DELAYS_MS[0];
  return new Date(now.getTime() + delay);
}

export function signPayload(secret: string, timestamp: string, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

/** Base URL for relative notify URLs (seeded demo receiver). */
export function appBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function resolveNotifyUrl(url: string): string {
  return url.startsWith("/") ? appBaseUrl() + url : url;
}

export const SIGNING_SECRET_MISSING = "signing_secret_missing";

/** The merchant's newest usable signing secret of the mode, or null (no fallback — see the header comment). */
export async function signingSecretFor(db: Db, merchantId: string, livemode: boolean): Promise<string | null> {
  const keys = await db.apiKey.findMany({
    where: { merchantId, kind: "signing_secret", mode: livemode ? "live" : "test", revokedAt: null, secretEnc: { not: null } },
    orderBy: { issuedAt: "desc" },
    select: { secretEnc: true, expiresAt: true, revokedAt: true },
  });
  const usable = keys.find((k) => apiKeyUsable(k));
  return usable?.secretEnc ? decryptSigningSecret(usable.secretEnc) : null;
}

export interface EnqueueInput {
  merchantId: string;
  paymentId: string | null;
  event: MerchantWebhookEvent;
  livemode: boolean;
  values: Omit<NotificationValues, "event" | "merchant_id">;
}

/**
 * Build + sign the request and store it as a pending delivery. Returns the
 * delivery id (null when the merchant has no notify URL). When the merchant
 * has no usable signing secret for the mode the row is stored as `failed`
 * (error signing_secret_missing) and never attempted.
 */
export async function enqueueWebhook(db: Db, input: EnqueueInput): Promise<string | null> {
  const merchant = await db.merchant.findUnique({
    where: { id: input.merchantId },
    select: { merchantCode: true, notifyUrl: true, notifyFormat: true, notifyParamSet: true, notifyIdFormat: true },
  });
  if (!merchant || !merchant.notifyUrl) return null;
  const req = buildNotificationRequest(
    {
      notifyUrl: resolveNotifyUrl(merchant.notifyUrl),
      notifyFormat: isNotifyFormat(merchant.notifyFormat) ? merchant.notifyFormat : "json_post",
      notifyParamSet: isNotifyParamSet(merchant.notifyParamSet) ? merchant.notifyParamSet : "standard",
      notifyIdFormat: isNotifyIdFormat(merchant.notifyIdFormat) ? merchant.notifyIdFormat : "payment_id",
    },
    { ...input.values, event: input.event, merchant_id: merchant.merchantCode },
  );
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = await signingSecretFor(db, input.merchantId, input.livemode);
  if (secret === null) {
    const mode = input.livemode ? "live" : "test";
    const row = await db.webhookDelivery.create({
      data: {
        merchantId: input.merchantId,
        paymentId: input.paymentId,
        livemode: input.livemode,
        event: input.event,
        url: req.url,
        method: req.method,
        requestHeaders: JSON.stringify(req.headers),
        requestBody: req.body,
        status: "failed",
        responseBody: `error: ${SIGNING_SECRET_MISSING}`,
      },
      select: { id: true },
    });
    await emitNotification(db, {
      kind: "webhook.signing_secret_missing",
      title: `Webhook not sent: no ${mode} signing secret for ${merchant.merchantCode}`,
      body: `${input.event} could not be signed because the merchant has no usable ${mode} signing secret. Issue one on the merchant's API keys tab, then resend from the delivery log.`,
      href: `/webhook-logs/${row.id}`,
      roles: ["admin", "developer"],
      targetType: "merchant",
      targetId: `${input.merchantId}:${mode}`,
    });
    return row.id;
  }
  const headers = { ...req.headers, ...signatureHeaders(timestamp, signPayload(secret, timestamp, req.signedPayload)) };
  const row = await db.webhookDelivery.create({
    data: {
      merchantId: input.merchantId,
      paymentId: input.paymentId,
      livemode: input.livemode,
      event: input.event,
      url: req.url,
      method: req.method,
      requestHeaders: JSON.stringify(headers),
      requestBody: req.body,
      status: "pending",
    },
    select: { id: true },
  });
  return row.id;
}

export interface AttemptResult {
  ok: boolean;
  status: WebhookStatus;
  responseStatus: number | null;
  error: string | null;
}

/** One HTTP try. `trigger` is recorded on the attempt (system | cron | dashboard). */
export async function attemptDelivery(db: PrismaClient, deliveryId: string, trigger: "system" | "cron" | "dashboard" = "system", now: Date = new Date()): Promise<AttemptResult> {
  const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new Error(`delivery not found: ${deliveryId}`);
  // A delivery stored without a signature (no signing secret at the time) is
  // re-signed on resend; still no secret → stays failed, nothing is sent.
  if (!("X-Signature" in (JSON.parse(d.requestHeaders) as Record<string, string>))) {
    const secret = await signingSecretFor(db, d.merchantId, d.livemode);
    if (secret === null) {
      await db.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "failed", responseBody: `error: ${SIGNING_SECRET_MISSING}`, nextRetryAt: null } });
      return { ok: false, status: "failed", responseStatus: null, error: SIGNING_SECRET_MISSING };
    }
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const payload = d.method === "GET" ? new URL(d.url).search.replace(/^\?/, "") : d.requestBody ?? "";
    const headers = { ...(JSON.parse(d.requestHeaders) as Record<string, string>), ...signatureHeaders(timestamp, signPayload(secret, timestamp, payload)) };
    await db.webhookDelivery.update({ where: { id: deliveryId }, data: { requestHeaders: JSON.stringify(headers) } });
    d.requestHeaders = JSON.stringify(headers);
  }
  const attemptNo = d.attempts + 1;
  const started = Date.now();
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(d.url, {
      method: d.method,
      headers: JSON.parse(d.requestHeaders) as Record<string, string>,
      body: d.method === "GET" ? undefined : d.requestBody ?? undefined,
      signal: controller.signal,
      redirect: "manual",
    });
    responseStatus = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, RESPONSE_BODY_LIMIT);
  } catch (e) {
    error = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : String(e);
  } finally {
    clearTimeout(timer);
  }
  const ok = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
  const retryAt = ok ? null : nextRetryAt(attemptNo, now);
  const status: WebhookStatus = ok ? "success" : retryAt ? "retrying" : "abandoned";
  await db.$transaction([
    db.webhookAttempt.create({
      data: { deliveryId, attemptNo, sentAt: now, responseStatus, responseBody, error, durationMs: Date.now() - started, trigger },
    }),
    db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts: attemptNo, status, responseStatus, responseBody: responseBody ?? (error ? `error: ${error}` : null), nextRetryAt: retryAt, lastSentAt: now },
    }),
  ]);
  if (status === "abandoned") {
    const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId }, select: { event: true, url: true, merchantId: true, merchant: { select: { merchantCode: true } } } });
    await emitNotification(db, { kind: "webhook.abandoned", title: `Webhook abandoned: ${d?.event ?? ""} → ${d?.merchant?.merchantCode ?? ""}`, body: `${MAX_ATTEMPTS} attempts failed for ${d?.url ?? ""}. Resend it from the delivery log once the merchant endpoint is back.`, href: `/webhook-logs/${deliveryId}`, roles: ["admin", "developer"], targetType: "webhook_delivery", targetId: deliveryId, now });
  }
  return { ok, status, responseStatus, error };
}

/** True when deliveries should stay queued (unit tests) instead of hitting the network. */
export function deliveryDeferred(): boolean {
  return process.env.WEBHOOK_DELIVERY === "queue" || process.env.NODE_ENV === "test";
}

/** Enqueue and, unless deferred, try once right away. Never throws — a failing webhook must not fail the operation that produced it. */
export async function emitWebhook(db: PrismaClient, input: EnqueueInput): Promise<string | null> {
  try {
    const id = await enqueueWebhook(db, input);
    if (id && !deliveryDeferred()) {
      const row = await db.webhookDelivery.findUnique({ where: { id }, select: { status: true } });
      if (row?.status === "pending") await attemptDelivery(db, id, "system");
    }
    return id;
  } catch (e) {
    console.error("[webhook] emit failed", e);
    return null;
  }
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  captured: "captured",
  partially_refunded: "partially_refunded",
  refunded: "refunded",
  failed: "failed",
  expired: "expired",
  cancelled: "cancelled",
};

/** Convenience: load the payment and emit `event` for it. */
export async function emitPaymentWebhook(db: PrismaClient, paymentId: string, event: MerchantWebhookEvent, overrides: Partial<NotificationValues> = {}): Promise<string | null> {
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, merchantId: true, livemode: true, externalId: true, amount: true, currency: true, status: true, capturedAt: true, updatedAt: true, method: true, customerId: true, productName: true, merchant: { select: { notifyUrl: true } } },
  });
  if (!p || !p.merchantId) return null;
  let domain = "";
  try {
    domain = new URL(p.merchant?.notifyUrl ?? "").hostname;
  } catch {
    domain = "";
  }
  return emitWebhook(db, {
    merchantId: p.merchantId,
    paymentId: p.id,
    event,
    livemode: p.livemode,
    values: {
      payment_id: p.id,
      transaction_id: p.externalId ?? "",
      amount: String(p.amount),
      currency: p.currency,
      paid_at: (p.capturedAt ?? p.updatedAt).toISOString(),
      status: PAYMENT_STATUS_LABEL[p.status] ?? p.status,
      payment_method: p.method ?? "",
      user_id: p.customerId ?? "",
      product_id: p.productName ?? "",
      domain,
      ...overrides,
    },
  });
}

/** Cron entry: retry every delivery whose nextRetryAt has passed. */
export async function processDueRetries(db: PrismaClient, now: Date = new Date(), limit = 100): Promise<{ processed: number; succeeded: number }> {
  const due = await db.webhookDelivery.findMany({ where: { status: { in: ["pending", "retrying"] }, OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null, status: "pending" }] }, select: { id: true }, take: limit, orderBy: { nextRetryAt: "asc" } });
  let succeeded = 0;
  for (const d of due) {
    const r = await attemptDelivery(db, d.id, "cron", now);
    if (r.ok) succeeded++;
  }
  return { processed: due.length, succeeded };
}

/** Manual resend (master): a new attempt regardless of the schedule; an abandoned delivery is revived. */
export async function resendDelivery(db: PrismaClient, deliveryId: string, now: Date = new Date()): Promise<AttemptResult> {
  return attemptDelivery(db, deliveryId, "dashboard", now);
}
