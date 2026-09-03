// Transaction creation shared by the dashboard / merchant API
// (POST /api/payments), payment-link checkouts and subscription charges.
//
// Card / QR start authorized (or captured when autoCapture), konbini starts
// pending, and bank transfer starts awaiting_transfer with a transfer id of
// the merchant's configured length and the merchant's deadline. Blacklist
// hits and merchant limits are recorded as failed transactions with the
// reason; the merchant is notified and repeated failures feed the blacklist.

import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { DEMO_LIMITS } from "@/lib/demo";
import { notifyTransferIssued } from "@/lib/email/hooks";
import { isUniqueViolation } from "@/lib/ids";
import { emitNotification } from "@/lib/notifications/emit";
import { checkLimit, limitFailureReason } from "@/lib/merchants/limits";
import { assertMethodAvailable } from "@/lib/payments/method-controls";
import { toPaymentMethod } from "@/lib/payments/methods";
import { initialStatus } from "@/lib/payments/transitions";
import { DEFAULT_TRANSFER_ID_DIGITS, generateTransferId, isTransferIdDigits, transferDueDate } from "@/lib/payments/transfer";
import { blockedFailureReason, cardFingerprint, checkBlacklist, detectRepeatedFailures } from "@/lib/risk/service";
import { cardInputSchema } from "@/lib/risk/types";
import { emitPaymentWebhook } from "@/lib/webhooks/deliver";

export const createTransactionSchema = z.object({
  providerId: z.string().min(1),
  // The merchant whose checkout produced the transaction. Optional for API
  // clients that predate merchants; the dashboard form always sends it.
  merchantId: z.string().min(1).max(64).nullable().optional(),
  orderNumber: z.string().min(1).max(64),
  amount: z.number().int().positive().max(99_999_999),
  // JPY only — the dashboard formats everything as yen.
  currency: z.literal("JPY").default("JPY"),
  productName: z.string().max(200).nullable().optional(),
  customerName: z.string().max(120).nullable().optional(),
  customerId: z.string().max(64).nullable().optional(),
  customerEmail: z.string().email().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  autoCapture: z.boolean().default(true),
  idempotencyKey: z.string().min(8).max(128).optional(),
  // Demo card details (Phase F): only a fingerprint and the last 4 digits are stored.
  card: cardInputSchema.optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export interface CreateTransactionOptions {
  clientIp: string | null;
  audit: AuditContext;
  /** Origin of the checkout: dashboard (default) | payment_link | subscription. */
  source?: "dashboard" | "payment_link" | "subscription";
  paymentLinkId?: string | null;
  subscriptionId?: string | null;
  now?: Date;
}

export interface CreatedTransaction {
  id: string;
  externalId: string | null;
  transferId: string | null;
  transferDueAt: Date | null;
  status: string;
  failureReason: string | null;
  replayed: boolean;
}

export function generateDemoExternalId(prefixKey: string): string {
  const prefix = prefixKey.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix || "demo"}_${ts}_${rand}`;
}

export async function createTransaction(prisma: PrismaClient, body: CreateTransactionInput, opts: CreateTransactionOptions): Promise<CreatedTransaction> {
  const idempotencyKey = body.idempotencyKey;
  // Idempotent replay: same key → same result, no second payment.
  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey }, select: { id: true, externalId: true, transferId: true, transferDueAt: true, status: true, failureReason: true } });
    if (existing) return { ...existing, replayed: true };
  }

  const provider = await prisma.paymentProvider.findUnique({ where: { id: body.providerId }, select: { id: true, providerKey: true, category: true, status: true, testMode: true } });
  if (!provider) throw new ApiError(404, "provider_not_found", "errors.providerNotFound");
  if (provider.status !== "active") throw new ApiError(400, "provider_disabled", "errors.providerDisabled");

  let transferDigits = DEFAULT_TRANSFER_ID_DIGITS;
  let transferDueDays: number | undefined;
  if (body.merchantId) {
    const merchant = await prisma.merchant.findUnique({ where: { id: body.merchantId }, select: { id: true, transferIdDigits: true, transferDueDays: true } });
    if (!merchant) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { merchantId: "invalid" } });
    if (isTransferIdDigits(merchant.transferIdDigits)) transferDigits = merchant.transferIdDigits;
    transferDueDays = merchant.transferDueDays;
  }

  const count = await prisma.payment.count();
  if (count >= DEMO_LIMITS.payments) throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.payments });

  const method = toPaymentMethod(provider.category);
  // Phase I-3: a suspended method (global or per merchant) refuses the checkout before any row is written.
  await assertMethodAvailable(prisma, { merchantId: body.merchantId ?? null, method });
  const now = opts.now ?? new Date();
  const externalId = generateDemoExternalId(provider.providerKey);
  const livemode = !provider.testMode;

  // Risk keys (F-2): card fingerprint, source IP, email.
  const cardHash = body.card ? cardFingerprint(body.card) : null;
  const cardLast4 = body.card?.last4 ?? null;
  const clientIp = opts.clientIp;
  const blocked = await checkBlacklist(prisma, { cardHash, clientIp, email: body.customerEmail });

  // Merchant limits (B-2): an exceeding transaction is still recorded — as
  // failed with the reason — so the merchant sees why the checkout stopped.
  const limit = !blocked && body.merchantId ? await checkLimit(prisma, { merchantId: body.merchantId, method, amount: body.amount, livemode, now }) : { ok: true as const };
  const failureReason = blocked ? blockedFailureReason(blocked.kind) : limit.ok ? null : limitFailureReason(limit.reason);
  const status = failureReason ? "failed" : initialStatus(provider.category, body.autoCapture);
  const isBank = method === "bank" && !failureReason;
  const actor = opts.source === "subscription" ? "system" : "dashboard";

  // A random transfer id can collide with an existing one; the unique
  // constraint rejects it and we draw a new one once.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const payment = await prisma.payment.create({
        data: {
          providerId: provider.id,
          merchantId: body.merchantId ?? null,
          method,
          orderNumber: body.orderNumber,
          amount: body.amount,
          currency: body.currency,
          productName: body.productName ?? null,
          customerName: body.customerName ?? null,
          customerId: body.customerId ?? null,
          customerEmail: body.customerEmail ?? null,
          description: body.description ?? null,
          externalId,
          status,
          failureReason,
          cardHash,
          cardLast4,
          clientIp,
          livemode,
          idempotencyKey: idempotencyKey ?? null,
          paymentLinkId: opts.paymentLinkId ?? null,
          subscriptionId: opts.subscriptionId ?? null,
          createdAt: now,
          capturedAt: status === "captured" ? now : null,
          transferId: isBank ? generateTransferId(transferDigits) : null,
          transferDueAt: isBank ? transferDueDate(now, transferDueDays) : null,
          events: {
            create: [
              { type: "created", fromStatus: null, toStatus: status === "captured" ? "authorized" : status === "failed" ? "pending" : status, amount: body.amount, actor },
              ...(status === "failed" ? [{ type: "fail", fromStatus: "pending", toStatus: "failed", amount: body.amount, actor: "system" as const }] : []),
              ...(status === "captured" ? [{ type: "capture", fromStatus: "authorized", toStatus: "captured", amount: body.amount, actor }] : []),
            ],
          },
        },
        select: { id: true, externalId: true, transferId: true, transferDueAt: true, status: true, failureReason: true },
      });
      await recordAudit(prisma, opts.audit, {
        action: "payment.create",
        targetType: "payment",
        targetId: payment.id,
        after: { ...payment, merchantId: body.merchantId ?? null, orderNumber: body.orderNumber, amount: body.amount, method, livemode, source: opts.source ?? "dashboard" },
      });
      // Tell the merchant when their own limit stopped the checkout (Phase E).
      if (status === "failed" && body.merchantId && !limit.ok) {
        await emitPaymentWebhook(prisma, payment.id, "limit.exceeded", { status: `failed:${failureReason}` });
        await emitNotification(prisma, { kind: "limit.exceeded", title: `Limit exceeded: ${body.orderNumber}`, body: `A ${method} checkout of ¥${body.amount.toLocaleString("en-US")} was blocked by the merchant's limit (${failureReason}).`, href: `/payments/${payment.id}`, roles: ["admin", "accounting", "cs"], targetType: "payment", targetId: payment.id, now });
      }
      // Completed at creation (auto-capture) → the merchant is notified like any completion.
      if (status === "captured" && body.merchantId && opts.source !== "subscription") {
        await emitPaymentWebhook(prisma, payment.id, "payment.completed");
      }
      // Bank transfer instructions to the customer (Phase G-2).
      if (isBank) await notifyTransferIssued(prisma, payment.id);
      // Repeated failures from the same card / IP / email become blacklist candidates (F-2).
      if (status === "failed") {
        await detectRepeatedFailures(prisma, { cardHash, clientIp, email: body.customerEmail }, now).catch((e) => console.error("[risk] detect failed", e));
      }
      return { ...payment, replayed: false };
    } catch (err) {
      if (attempt === 0 && isBank && isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new ApiError(409, "conflict", "errors.conflict");
}
