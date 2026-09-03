// Payment links (Phase H-2): issue / disable links and the hosted checkout
// that turns a link into a transaction through lib/payments/create.ts.

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, systemAuditContext, type AuditContext } from "@/lib/audit";
import { parseEnabledMethods } from "@/lib/merchants/types";
import { createTransaction } from "@/lib/payments/create";
import { suspendedMethods } from "@/lib/payments/method-controls";
import type { PaymentMethod } from "@/lib/payments/methods";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import type { LinkCheckoutInput, LinkUnavailableReason, PaymentLinkInput } from "./types";

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateLinkToken(length = 24): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export const PAYMENT_LINK_SELECT = {
  id: true,
  merchantId: true,
  token: true,
  productName: true,
  amount: true,
  description: true,
  expiresAt: true,
  maxUses: true,
  usedCount: true,
  status: true,
  livemode: true,
  createdAt: true,
  updatedAt: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true, enabledMethods: true } },
} as const;

export async function createPaymentLink(db: PrismaClient, opts: { input: PaymentLinkInput; livemode: boolean; actorId: string | null; audit: AuditContext }) {
  const merchant = await db.merchant.findUnique({ where: { id: opts.input.merchantId }, select: { id: true } });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  const expiresAt = opts.input.expiresAt ? nextDayInTz(parseDateInTz(opts.input.expiresAt)!) : null;
  return db.$transaction(async (tx) => {
    const row = await tx.paymentLink.create({
      data: {
        merchantId: merchant.id,
        token: generateLinkToken(),
        productName: opts.input.productName,
        amount: opts.input.amount,
        description: opts.input.description || null,
        expiresAt,
        maxUses: opts.input.maxUses || null,
        status: "active",
        livemode: opts.livemode,
        createdById: opts.actorId,
      },
      select: PAYMENT_LINK_SELECT,
    });
    await recordAudit(tx, opts.audit, { action: "payment_link.create", targetType: "payment_link", targetId: row.id, after: { merchantId: merchant.id, productName: row.productName, amount: row.amount, expiresAt, maxUses: row.maxUses, livemode: opts.livemode } });
    return row;
  });
}

export async function disablePaymentLink(db: PrismaClient, opts: { id: string; audit: AuditContext }) {
  const before = await db.paymentLink.findUnique({ where: { id: opts.id }, select: { status: true } });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  if (before.status === "disabled") throw new ApiError(409, "invalid_transition", "errors.paymentLinkDisabled");
  return db.$transaction(async (tx) => {
    const row = await tx.paymentLink.update({ where: { id: opts.id }, data: { status: "disabled" }, select: PAYMENT_LINK_SELECT });
    await recordAudit(tx, opts.audit, { action: "payment_link.disable", targetType: "payment_link", targetId: opts.id, before: { status: before.status }, after: { status: "disabled" } });
    return row;
  });
}

export function linkUnavailableReason(link: { status: string; expiresAt: Date | null; maxUses: number | null; usedCount: number }, now: Date = new Date()): LinkUnavailableReason | null {
  if (link.status !== "active") return "disabled";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  if (link.maxUses !== null && link.usedCount >= link.maxUses) return "exhausted";
  return null;
}

/** Providers a customer may pick on the hosted page: the merchant's enabled methods that have an active provider in the link's mode. */
export async function checkoutMethods(db: PrismaClient, link: { livemode: boolean; merchant: { id: string; enabledMethods: string } }): Promise<Array<{ method: PaymentMethod; providerId: string }>> {
  const suspended = await suspendedMethods(db, link.merchant.id);
  const enabled = parseEnabledMethods(link.merchant.enabledMethods).filter((m) => !suspended.has(m));
  const providers = await db.paymentProvider.findMany({ where: { status: "active", testMode: !link.livemode }, select: { id: true, category: true }, orderBy: { createdAt: "asc" } });
  const out: Array<{ method: PaymentMethod; providerId: string }> = [];
  for (const m of enabled) {
    const p = providers.find((x) => x.category === m);
    if (p) out.push({ method: m, providerId: p.id });
  }
  return out;
}

/** Hosted checkout: create the transaction for a link and count the use. */
export async function checkoutFromLink(db: PrismaClient, opts: { token: string; input: LinkCheckoutInput; clientIp: string | null; now?: Date }) {
  const now = opts.now ?? new Date();
  const link = await db.paymentLink.findUnique({ where: { token: opts.token }, select: PAYMENT_LINK_SELECT });
  if (!link) throw new ApiError(404, "not_found", "errors.notFound");
  const reason = linkUnavailableReason(link, now);
  if (reason) throw new ApiError(409, `link_${reason}`, `errors.paymentLink_${reason}` as "errors.paymentLink_disabled");
  const methods = await checkoutMethods(db, link);
  const chosen = methods.find((m) => m.method === opts.input.method);
  if (!chosen) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { method: "unavailable" } });
  const created = await createTransaction(
    db,
    {
      providerId: chosen.providerId,
      merchantId: link.merchantId,
      orderNumber: `LNK-${link.token.slice(0, 6).toUpperCase()}-${String(link.usedCount + 1).padStart(4, "0")}`,
      amount: link.amount,
      currency: "JPY",
      productName: link.productName,
      customerName: opts.input.customerName,
      customerId: opts.input.customerEmail || `guest_${now.getTime().toString(36)}`,
      customerEmail: opts.input.customerEmail || null,
      description: link.description,
      autoCapture: false,
      cvsBrand: opts.input.cvsBrand,
    },
    { clientIp: opts.clientIp, audit: systemAuditContext("system"), source: "payment_link", paymentLinkId: link.id, now },
  );
  await db.paymentLink.update({ where: { id: link.id }, data: { usedCount: { increment: 1 } } });
  return { link, payment: created, method: chosen.method };
}
