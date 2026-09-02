import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { initialStatus } from "@/lib/payments/transitions";
import { toPaymentMethod } from "@/lib/payments/methods";
import { DEFAULT_TRANSFER_ID_DIGITS, generateTransferId, isTransferIdDigits, transferDueDate } from "@/lib/payments/transfer";
import { isUniqueViolation } from "@/lib/ids";
import { DEMO_LIMITS } from "@/lib/demo";

const CreateSchema = z.object({
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
});

/**
 * POST /api/payments — record a transaction (payment application) created at checkout.
 *
 * Card / QR start authorized (or captured when autoCapture), konbini starts
 * pending, and bank transfer starts awaiting_transfer with a transfer id of
 * the merchant's configured length and a deadline of TRANSFER_DUE_DAYS.
 */
export const POST = withApiHandler(async (req) => {
  const body = CreateSchema.parse(await readJson(req));
  const idempotencyKey = req.headers.get("idempotency-key") ?? body.idempotencyKey;

  // Idempotent replay: same key → same result, no second payment.
  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey },
      select: { id: true, externalId: true },
    });
    if (existing) return ok({ ...existing, replayed: true });
  }

  const provider = await prisma.paymentProvider.findUnique({
    where: { id: body.providerId },
    select: { id: true, providerKey: true, category: true, status: true, testMode: true },
  });
  if (!provider) throw new ApiError(404, "provider_not_found", "errors.providerNotFound");
  if (provider.status !== "active") {
    throw new ApiError(400, "provider_disabled", "errors.providerDisabled");
  }

  let transferDigits = DEFAULT_TRANSFER_ID_DIGITS;
  if (body.merchantId) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: body.merchantId },
      select: { id: true, transferIdDigits: true },
    });
    if (!merchant) {
      throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { merchantId: "invalid" } });
    }
    if (isTransferIdDigits(merchant.transferIdDigits)) transferDigits = merchant.transferIdDigits;
  }

  const count = await prisma.payment.count();
  if (count >= DEMO_LIMITS.payments) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.payments });
  }

  const method = toPaymentMethod(provider.category);
  const status = initialStatus(provider.category, body.autoCapture);
  const now = new Date();
  const externalId = generateDemoExternalId(provider.providerKey);
  const isBank = method === "bank";

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
          livemode: !provider.testMode,
          idempotencyKey: idempotencyKey ?? null,
          createdAt: now,
          capturedAt: status === "captured" ? now : null,
          transferId: isBank ? generateTransferId(transferDigits) : null,
          transferDueAt: isBank ? transferDueDate(now) : null,
          events: {
            create: [
              {
                type: "created",
                fromStatus: null,
                toStatus: status === "captured" ? "authorized" : status,
                amount: body.amount,
                actor: "dashboard",
              },
              ...(status === "captured"
                ? [
                    {
                      type: "capture",
                      fromStatus: "authorized",
                      toStatus: "captured",
                      amount: body.amount,
                      actor: "dashboard" as const,
                    },
                  ]
                : []),
            ],
          },
        },
        select: { id: true, externalId: true, transferId: true, transferDueAt: true, status: true },
      });
      return ok({ ...payment, replayed: false }, { status: 201 });
    } catch (err) {
      if (attempt === 0 && isBank && isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new ApiError(409, "conflict", "errors.conflict");
});

function generateDemoExternalId(prefixKey: string): string {
  const prefix = prefixKey.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix || "demo"}_${ts}_${rand}`;
}
