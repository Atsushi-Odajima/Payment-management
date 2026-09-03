// Public API v1 transaction service (Phase L-1): maps an API request onto
// lib/payments/create.ts. The provider is the active one of the requested
// method in the key's environment; the merchant must have the method
// enabled. Test card numbers select a scenario in test mode and are refused
// in live mode.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { parseEnabledMethods } from "@/lib/merchants/types";
import { createTransaction } from "@/lib/payments/create";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import type { PublicApiContext } from "./auth";
import type { CreateTransactionApiInput, ListTransactionsQuery } from "./schemas";
import { PUBLIC_TRANSACTION_SELECT, serializeTransaction, type PublicTransaction } from "./serialize";
import { cardBrandOf, findTestCard, luhnValid } from "./test-cards";

export async function createApiTransaction(db: PrismaClient, ctx: PublicApiContext, body: CreateTransactionApiInput, idempotencyKey: string | undefined, now: Date = new Date()): Promise<{ transaction: PublicTransaction; replayed: boolean }> {
  const merchant = await db.merchant.findUnique({ where: { id: ctx.merchantId }, select: { enabledMethods: true } });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  if (!parseEnabledMethods(merchant.enabledMethods).includes(body.method)) throw new ApiError(400, "method_not_enabled", "errors.methodNotEnabled");

  // Card scenarios (test cards) — only meaningful for card payments; validated before any lookup.
  let card: { brand: "visa" | "mastercard" | "jcb" | "amex" | "diners"; last4: string; expiry: string } | undefined;
  let forcedFailure: string | null = null;
  let autoCapture = body.autoCapture;
  if (body.method === "credit" && body.card) {
    if (!luhnValid(body.card.number)) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { "card.number": "invalid" } });
    const scenario = findTestCard(body.card.number);
    if (scenario && ctx.livemode) throw new ApiError(400, "test_card_in_live", "errors.testCardInLive");
    if (scenario?.failureReason) forcedFailure = scenario.failureReason;
    if (scenario?.outcome === "authorized_only") autoCapture = false;
    card = { brand: cardBrandOf(body.card.number), last4: body.card.number.slice(-4), expiry: `${String(body.card.expMonth).padStart(2, "0")}/${String(body.card.expYear).slice(-2)}` };
  }

  const provider = await db.paymentProvider.findFirst({ where: { status: "active", category: body.method, testMode: !ctx.livemode }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!provider) throw new ApiError(400, "provider_not_found", "errors.providerNotFound");

  const created = await createTransaction(
    db,
    {
      providerId: provider.id,
      merchantId: ctx.merchantId,
      orderNumber: body.orderNumber,
      amount: body.amount,
      currency: "JPY",
      productName: body.productName ?? null,
      customerName: body.customerName ?? null,
      customerId: body.customerId ?? null,
      customerEmail: body.customerEmail ?? null,
      description: body.description ?? null,
      autoCapture,
      idempotencyKey: idempotencyKey ?? body.idempotencyKey,
      card,
      cvsBrand: body.cvsBrand,
    },
    { clientIp: ctx.ip, audit: ctx.audit, source: "api", forcedFailure, now },
  );
  const row = await db.payment.findUniqueOrThrow({ where: { id: created.id }, select: PUBLIC_TRANSACTION_SELECT });
  return { transaction: serializeTransaction(row), replayed: created.replayed };
}

/** One transaction of the key's merchant and environment, or null. */
export async function getApiTransaction(db: PrismaClient, ctx: PublicApiContext, id: string): Promise<PublicTransaction | null> {
  const row = await db.payment.findFirst({ where: { id, merchantId: ctx.merchantId, livemode: ctx.livemode }, select: PUBLIC_TRANSACTION_SELECT });
  return row ? serializeTransaction(row) : null;
}

export async function listApiTransactions(db: PrismaClient, ctx: PublicApiContext, q: ListTransactionsQuery): Promise<{ data: PublicTransaction[]; hasMore: boolean }> {
  const from = parseDateInTz(q.from);
  const to = parseDateInTz(q.to);
  const rows = await db.payment.findMany({
    where: {
      merchantId: ctx.merchantId,
      livemode: ctx.livemode,
      ...(q.status ? { status: q.status } : {}),
      ...(q.method ? { method: q.method } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: nextDayInTz(to) } : {}) } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.startingAfter ? { cursor: { id: q.startingAfter }, skip: 1 } : {}),
    select: PUBLIC_TRANSACTION_SELECT,
  });
  const hasMore = rows.length > q.limit;
  return { data: rows.slice(0, q.limit).map(serializeTransaction), hasMore };
}
