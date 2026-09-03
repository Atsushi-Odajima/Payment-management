// Recurring billing (Phase H-1): plans, subscriptions and the charge cycle.
//
// A charge creates a transaction through lib/payments/create.ts (the same
// path as every other checkout) on the merchant's card provider. The demo
// has no real card network, so a configurable percentage of charges fails;
// failures retry after 3 then 7 days and the third failure suspends the
// subscription. Every step emits a merchant webhook and a customer email.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, systemAuditContext, type AuditContext } from "@/lib/audit";
import { notifySubscriptionFailed, notifySubscriptionSuspended } from "@/lib/email/hooks";
import { createTransaction } from "@/lib/payments/create";
import { emitPaymentWebhook } from "@/lib/webhooks/deliver";
import { RISK_SETTINGS_ID } from "@/lib/risk/types";
import { MAX_CHARGE_FAILURES, RETRY_DAYS, addInterval, isPlanInterval, type PlanInput, type SubscriptionAction, type SubscriptionInput } from "./types";

export const PLAN_SELECT = {
  id: true,
  merchantId: true,
  name: true,
  amount: true,
  interval: true,
  trialDays: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
  _count: { select: { subscriptions: true } },
} as const;

export const SUBSCRIPTION_SELECT = {
  id: true,
  merchantId: true,
  planId: true,
  customerId: true,
  customerName: true,
  customerEmail: true,
  status: true,
  livemode: true,
  nextChargeAt: true,
  startedAt: true,
  cancelledAt: true,
  lastChargeAt: true,
  failCount: true,
  createdAt: true,
  updatedAt: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
  plan: { select: { id: true, name: true, amount: true, interval: true, trialDays: true } },
} as const;

export async function createPlan(db: PrismaClient, opts: { input: PlanInput; audit: AuditContext }) {
  const merchant = await db.merchant.findUnique({ where: { id: opts.input.merchantId }, select: { id: true } });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  return db.$transaction(async (tx) => {
    const row = await tx.plan.create({ data: opts.input, select: PLAN_SELECT });
    await recordAudit(tx, opts.audit, { action: "plan.create", targetType: "plan", targetId: row.id, after: opts.input });
    return row;
  });
}

export async function updatePlan(db: PrismaClient, opts: { id: string; input: Omit<PlanInput, "merchantId">; audit: AuditContext }) {
  const before = await db.plan.findUnique({ where: { id: opts.id }, select: { name: true, amount: true, interval: true, trialDays: true, active: true } });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  return db.$transaction(async (tx) => {
    const row = await tx.plan.update({ where: { id: opts.id }, data: opts.input, select: PLAN_SELECT });
    await recordAudit(tx, opts.audit, { action: "plan.update", targetType: "plan", targetId: opts.id, before, after: opts.input });
    return row;
  });
}

/** Start a subscription; trials start "trialing" and charge when the trial ends, others charge on the first cron run (or "charge now"). */
export async function createSubscription(db: PrismaClient, opts: { input: SubscriptionInput; livemode: boolean; audit: AuditContext; now?: Date }) {
  const now = opts.now ?? new Date();
  const plan = await db.plan.findUnique({ where: { id: opts.input.planId }, select: { id: true, merchantId: true, active: true, trialDays: true } });
  if (!plan) throw new ApiError(404, "not_found", "errors.notFound");
  if (!plan.active) throw new ApiError(409, "plan_inactive", "errors.planInactive");
  const trial = plan.trialDays > 0;
  return db.$transaction(async (tx) => {
    const row = await tx.subscription.create({
      data: {
        merchantId: plan.merchantId,
        planId: plan.id,
        customerId: opts.input.customerId,
        customerName: opts.input.customerName,
        customerEmail: opts.input.customerEmail || null,
        status: trial ? "trialing" : "active",
        livemode: opts.livemode,
        nextChargeAt: trial ? new Date(now.getTime() + plan.trialDays * 86_400_000) : now,
        startedAt: now,
      },
      select: SUBSCRIPTION_SELECT,
    });
    await recordAudit(tx, opts.audit, { action: "subscription.create", targetType: "subscription", targetId: row.id, after: { planId: plan.id, customerId: opts.input.customerId, status: row.status, nextChargeAt: row.nextChargeAt } });
    return row;
  });
}

/** Provider used for recurring charges: the merchant-agnostic active card provider, else any active one. */
async function chargeProvider(db: PrismaClient, livemode: boolean): Promise<{ id: string } | null> {
  const testMode = !livemode;
  return (
    (await db.paymentProvider.findFirst({ where: { status: "active", category: "credit", testMode }, select: { id: true } })) ??
    (await db.paymentProvider.findFirst({ where: { status: "active", category: "credit" }, select: { id: true } })) ??
    (await db.paymentProvider.findFirst({ where: { status: "active" }, select: { id: true } }))
  );
}

export interface ChargeOutcome {
  subscriptionId: string;
  paymentId: string | null;
  ok: boolean;
  status: string;
  nextChargeAt: Date | null;
}

/**
 * Charge one subscription now. `forceOutcome` bypasses the demo failure
 * percentage (tests and the "charge now" button use it).
 */
export async function chargeSubscription(
  db: PrismaClient,
  opts: { subscriptionId: string; audit?: AuditContext; forceOutcome?: "success" | "failure"; now?: Date },
): Promise<ChargeOutcome> {
  const now = opts.now ?? new Date();
  const sub = await db.subscription.findUnique({ where: { id: opts.subscriptionId }, select: SUBSCRIPTION_SELECT });
  if (!sub) throw new ApiError(404, "not_found", "errors.notFound");
  if (sub.status === "cancelled" || sub.status === "suspended") throw new ApiError(409, "invalid_transition", "errors.subscriptionTransition");
  const provider = await chargeProvider(db, sub.livemode);
  if (!provider) throw new ApiError(409, "provider_not_found", "errors.providerNotFound");
  const audit = opts.audit ?? systemAuditContext("cron");
  const setting = await db.riskSetting.findUnique({ where: { id: RISK_SETTINGS_ID }, select: { demoChargeFailPercent: true } });
  const failPercent = setting?.demoChargeFailPercent ?? 20;
  const fail = opts.forceOutcome ? opts.forceOutcome === "failure" : Math.random() * 100 < failPercent;
  const interval = isPlanInterval(sub.plan.interval) ? sub.plan.interval : "monthly";

  let paymentId: string | null = null;
  if (!fail) {
    const created = await createTransaction(
      db,
      {
        providerId: provider.id,
        merchantId: sub.merchantId,
        orderNumber: `SUB-${sub.id.slice(-6).toUpperCase()}-${now.toISOString().slice(0, 10).replace(/-/g, "")}`,
        amount: sub.plan.amount,
        currency: "JPY",
        productName: sub.plan.name,
        customerName: sub.customerName,
        customerId: sub.customerId,
        customerEmail: sub.customerEmail,
        description: `subscription ${sub.id}`,
        autoCapture: true,
      },
      { clientIp: null, audit, source: "subscription", subscriptionId: sub.id, now },
    );
    paymentId = created.id;
    if (created.status !== "captured") return recordFailure(db, sub, now, audit, paymentId, provider.id);
    const next = addInterval(sub.nextChargeAt && sub.nextChargeAt.getTime() > now.getTime() - 86_400_000 * 30 ? sub.nextChargeAt : now, interval);
    await db.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: sub.id }, data: { status: "active", failCount: 0, lastChargeAt: now, nextChargeAt: next } });
      await recordAudit(tx, audit, { action: "subscription.charge", targetType: "subscription", targetId: sub.id, after: { paymentId, ok: true, nextChargeAt: next } });
    });
    await emitPaymentWebhook(db, paymentId, "subscription.charged", { status: "captured" });
    return { subscriptionId: sub.id, paymentId, ok: true, status: "active", nextChargeAt: next };
  }
  return recordFailure(db, sub, now, audit, null, provider.id);
}

/** A charge that the demo card network declined: the failed transaction is still recorded so the history shows every attempt. */
async function createDeclinedCharge(
  db: PrismaClient,
  sub: { id: string; merchantId: string; customerId: string; customerEmail: string | null; customerName: string; livemode: boolean; plan: { name: string; amount: number } },
  providerId: string,
  now: Date,
  audit: AuditContext,
): Promise<string> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        providerId,
        merchantId: sub.merchantId,
        subscriptionId: sub.id,
        method: "credit",
        orderNumber: `SUB-${sub.id.slice(-6).toUpperCase()}-${now.toISOString().slice(0, 10).replace(/-/g, "")}-F`,
        productName: sub.plan.name,
        amount: sub.plan.amount,
        currency: "JPY",
        status: "failed",
        failureReason: "charge_declined",
        customerName: sub.customerName,
        customerId: sub.customerId,
        customerEmail: sub.customerEmail,
        description: `subscription ${sub.id}`,
        livemode: sub.livemode,
        createdAt: now,
        events: { create: [{ type: "created", fromStatus: null, toStatus: "failed", amount: sub.plan.amount, actor: "system", createdAt: now }] },
      },
      select: { id: true },
    });
    await recordAudit(tx, audit, { action: "payment.create", targetType: "payment", targetId: payment.id, after: { subscriptionId: sub.id, amount: sub.plan.amount, status: "failed", failureReason: "charge_declined" } });
    return payment.id;
  });
}

async function recordFailure(
  db: PrismaClient,
  sub: { id: string; merchantId: string; customerId: string; failCount: number; customerEmail: string | null; customerName: string; livemode: boolean; plan: { name: string; amount: number } },
  now: Date,
  audit: AuditContext,
  existingPaymentId: string | null,
  providerId: string,
): Promise<ChargeOutcome> {
  const paymentId = existingPaymentId ?? (await createDeclinedCharge(db, sub, providerId, now, audit));
  const failCount = sub.failCount + 1;
  const suspended = failCount >= MAX_CHARGE_FAILURES;
  const retryDays = RETRY_DAYS[Math.min(failCount - 1, RETRY_DAYS.length - 1)];
  const next = suspended ? null : new Date(now.getTime() + retryDays * 86_400_000);
  const status = suspended ? "suspended" : "past_due";
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: sub.id }, data: { status, failCount, lastChargeAt: now, nextChargeAt: next } });
    await recordAudit(tx, audit, { action: "subscription.charge", targetType: "subscription", targetId: sub.id, after: { paymentId, ok: false, failCount, status, nextChargeAt: next } });
  });
  if (paymentId) await emitPaymentWebhook(db, paymentId, suspended ? "subscription.suspended" : "subscription.payment_failed", { status });
  if (suspended) await notifySubscriptionSuspended(db, sub.id);
  else await notifySubscriptionFailed(db, sub.id, next!);
  return { subscriptionId: sub.id, paymentId, ok: false, status, nextChargeAt: next };
}

/** Cron entry: charge every trialing / active / past_due subscription whose nextChargeAt has passed. */
export async function processDueSubscriptions(db: PrismaClient, now: Date = new Date(), limit = 100): Promise<{ processed: number; succeeded: number; failed: number }> {
  const due = await db.subscription.findMany({ where: { status: { in: ["trialing", "active", "past_due"] }, nextChargeAt: { lte: now } }, select: { id: true }, take: limit, orderBy: { nextChargeAt: "asc" } });
  let succeeded = 0;
  let failed = 0;
  for (const s of due) {
    try {
      const r = await chargeSubscription(db, { subscriptionId: s.id, now });
      if (r.ok) succeeded++;
      else failed++;
    } catch (e) {
      console.error("[subscriptions] charge failed", e);
      failed++;
    }
  }
  return { processed: due.length, succeeded, failed };
}

/** Manual operator actions: pause (→ suspended), resume (→ active, charge on next run), cancel. */
export async function applySubscriptionAction(db: PrismaClient, opts: { id: string; action: Exclude<SubscriptionAction, "charge">; audit: AuditContext; now?: Date }) {
  const now = opts.now ?? new Date();
  const sub = await db.subscription.findUnique({ where: { id: opts.id }, select: { id: true, status: true } });
  if (!sub) throw new ApiError(404, "not_found", "errors.notFound");
  const from: Record<typeof opts.action, string[]> = { pause: ["trialing", "active", "past_due"], resume: ["suspended"], cancel: ["trialing", "active", "past_due", "suspended"] };
  if (!from[opts.action].includes(sub.status)) throw new ApiError(409, "invalid_transition", "errors.subscriptionTransition");
  const data = opts.action === "pause" ? { status: "suspended" } : opts.action === "resume" ? { status: "active", failCount: 0, nextChargeAt: now } : { status: "cancelled", cancelledAt: now, nextChargeAt: null };
  return db.$transaction(async (tx) => {
    const updated = await tx.subscription.updateMany({ where: { id: sub.id, status: { in: from[opts.action] } }, data });
    if (updated.count === 0) throw new ApiError(409, "invalid_transition", "errors.subscriptionTransition");
    await recordAudit(tx, opts.audit, { action: `subscription.${opts.action}`, targetType: "subscription", targetId: sub.id, before: { status: sub.status }, after: data });
    return tx.subscription.findUniqueOrThrow({ where: { id: sub.id }, select: SUBSCRIPTION_SELECT });
  });
}
