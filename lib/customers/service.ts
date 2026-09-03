// Customer master and payment tokens (Phase M-1) plus anonymisation
// (Phase M-2). Server only.
//
//   upsertCustomerForPayment  – called by createTransaction: resolves the
//                               merchant's customer id to a Customer row,
//                               refreshes name / e-mail, stores the card token
//   linkExistingPayments      – idempotent backfill for rows created before
//                               Phase M (run by the seed and db:link-customers)
//   anonymizeCustomer         – manual, admin, reason required, audited
//   runRetention              – daily job: customers idle for N months and
//                               orphan transactions older than N months are
//                               anonymised; audit logs older than the audit
//                               retention are pruned; one AnonymizeBatch row
//                               and one notification per run

import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { emitNotification } from "@/lib/notifications/emit";
import { loadGlobalSettings } from "@/lib/settings/global";

type Db = PrismaClient | Prisma.TransactionClient;

export const CUSTOMER_SELECT = {
  id: true,
  merchantId: true,
  externalId: true,
  name: true,
  email: true,
  phone: true,
  anonymizedAt: true,
  anonymizeReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface CardTokenInput {
  brand: string;
  last4: string;
  expiry: string;
  cardHash: string;
}

/** Resolve / refresh the customer of a checkout and remember the card. Returns the customer id (null when there is no merchant or customer id). */
export async function upsertCustomerForPayment(db: Db, input: { merchantId: string | null; customerId: string | null; customerName: string | null; customerEmail: string | null; card?: CardTokenInput | null; now?: Date }): Promise<string | null> {
  if (!input.merchantId || !input.customerId) return null;
  const now = input.now ?? new Date();
  const customer = await db.customer.upsert({
    where: { merchantId_externalId: { merchantId: input.merchantId, externalId: input.customerId } },
    create: { merchantId: input.merchantId, externalId: input.customerId, name: input.customerName, email: input.customerEmail, createdAt: now },
    // An anonymised customer that transacts again gets fresh data (a new retention window starts).
    update: { ...(input.customerName ? { name: input.customerName } : {}), ...(input.customerEmail ? { email: input.customerEmail } : {}), anonymizedAt: null, anonymizeReason: null },
    select: { id: true },
  });
  if (input.card) {
    await db.paymentToken.upsert({
      where: { customerId_cardHash: { customerId: customer.id, cardHash: input.card.cardHash } },
      create: { customerId: customer.id, brand: input.card.brand, last4: input.card.last4, expiry: input.card.expiry, cardHash: input.card.cardHash, createdAt: now, lastUsedAt: now },
      update: { lastUsedAt: now, expiry: input.card.expiry },
    });
  }
  return customer.id;
}

/** Backfill: link every transaction that has a merchant and a customer id but no customer row yet. Idempotent. */
export async function linkExistingPayments(db: PrismaClient, batch = 500): Promise<{ linked: number; customers: number }> {
  let linked = 0;
  let customers = 0;
  for (;;) {
    const rows = await db.payment.findMany({
      where: { customerRef: null, merchantId: { not: null }, customerId: { not: null } },
      select: { id: true, merchantId: true, customerId: true, customerName: true, customerEmail: true, cardHash: true, cardLast4: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: batch,
    });
    if (rows.length === 0) break;
    for (const p of rows) {
      const before = await db.customer.count({ where: { merchantId: p.merchantId!, externalId: p.customerId! } });
      const id = await upsertCustomerForPayment(db, { merchantId: p.merchantId, customerId: p.customerId, customerName: p.customerName, customerEmail: p.customerEmail, now: p.createdAt });
      if (before === 0) customers++;
      await db.payment.update({ where: { id: p.id }, data: { customerRef: id } });
      linked++;
    }
    if (rows.length < batch) break;
  }
  return { linked, customers };
}

/** Clear the personal data of one customer, its transactions and tokens (inside the caller's transaction). */
async function scrubCustomer(tx: Prisma.TransactionClient, customerId: string, now: Date, reason: string | null): Promise<{ payments: number; tokens: number }> {
  const tokens = await tx.paymentToken.deleteMany({ where: { customerId } });
  const payments = await tx.payment.updateMany({ where: { customerRef: customerId }, data: { customerName: null, customerEmail: null, clientIp: null, cardHash: null, cardLast4: null } });
  await tx.customer.update({ where: { id: customerId }, data: { name: null, email: null, phone: null, anonymizedAt: now, anonymizeReason: reason } });
  return { payments: payments.count, tokens: tokens.count };
}

export async function anonymizeCustomer(db: PrismaClient, opts: { customerId: string; reason: string; actorId: string; audit: AuditContext; now?: Date }) {
  const now = opts.now ?? new Date();
  const customer = await db.customer.findUnique({ where: { id: opts.customerId }, select: CUSTOMER_SELECT });
  if (!customer) throw new ApiError(404, "not_found", "errors.notFound");
  if (customer.anonymizedAt) throw new ApiError(409, "already_anonymized", "errors.alreadyAnonymized");
  return db.$transaction(async (tx) => {
    const r = await scrubCustomer(tx, customer.id, now, opts.reason);
    const batch = await tx.anonymizeBatch.create({ data: { kind: "manual", customers: 1, payments: r.payments, tokens: r.tokens, note: opts.reason, actorId: opts.actorId, startedAt: now, finishedAt: now } });
    await recordAudit(tx, opts.audit, {
      action: "pii.anonymize",
      targetType: "customer",
      targetId: customer.id,
      before: { externalId: customer.externalId, hadName: customer.name !== null, hadEmail: customer.email !== null },
      after: { reason: opts.reason, payments: r.payments, tokens: r.tokens, batchId: batch.id },
    });
    return { ...r, batchId: batch.id };
  });
}

export interface RetentionResult {
  batchId: string | null;
  customers: number;
  payments: number;
  tokens: number;
  auditLogs: number;
  retentionMonths: number;
  auditRetentionYears: number;
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** Daily retention job (Phase M-2). */
export async function runRetention(db: PrismaClient, audit: AuditContext, now: Date = new Date()): Promise<RetentionResult> {
  const settings = await loadGlobalSettings(db);
  const cutoff = monthsAgo(now, settings.piiRetentionMonths);
  // Customers with no transaction after the cutoff (or none at all and created before it).
  const candidates = await db.customer.findMany({
    where: { anonymizedAt: null, createdAt: { lt: cutoff }, payments: { none: { createdAt: { gte: cutoff } } } },
    select: { id: true },
    take: 500,
  });
  let payments = 0;
  let tokens = 0;
  for (const c of candidates) {
    const r = await db.$transaction((tx) => scrubCustomer(tx, c.id, now, null));
    payments += r.payments;
    tokens += r.tokens;
  }
  // Orphan transactions (no customer row) older than the cutoff that still carry personal data.
  const orphans = await db.payment.updateMany({
    where: { customerRef: null, createdAt: { lt: cutoff }, OR: [{ customerName: { not: null } }, { customerEmail: { not: null } }, { clientIp: { not: null } }, { cardHash: { not: null } }] },
    data: { customerName: null, customerEmail: null, clientIp: null, cardHash: null, cardLast4: null },
  });
  payments += orphans.count;
  // Audit log retention.
  const auditCutoff = new Date(now.getTime());
  auditCutoff.setUTCFullYear(auditCutoff.getUTCFullYear() - settings.auditRetentionYears);
  const pruned = await db.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } });

  const touched = candidates.length + payments + tokens + pruned.count;
  if (touched === 0) return { batchId: null, customers: 0, payments: 0, tokens: 0, auditLogs: 0, retentionMonths: settings.piiRetentionMonths, auditRetentionYears: settings.auditRetentionYears };
  const batch = await db.$transaction(async (tx) => {
    const b = await tx.anonymizeBatch.create({ data: { kind: "retention", customers: candidates.length, payments, tokens, auditLogs: pruned.count, startedAt: now, finishedAt: new Date() } });
    await recordAudit(tx, audit, { action: "pii.anonymize_batch", targetType: "anonymize_batch", targetId: b.id, after: { customers: candidates.length, payments, tokens, retentionMonths: settings.piiRetentionMonths } });
    if (pruned.count > 0) await recordAudit(tx, audit, { action: "audit_log.prune", targetType: "anonymize_batch", targetId: b.id, after: { auditLogs: pruned.count, auditRetentionYears: settings.auditRetentionYears } });
    return b;
  });
  await emitNotification(db, {
    kind: "pii.anonymized",
    title: `Personal data anonymised: ${candidates.length} customer(s)`,
    body: `Retention job: ${candidates.length} customers, ${payments} transactions and ${tokens} payment tokens anonymised (${settings.piiRetentionMonths} months); ${pruned.count} audit rows pruned (${settings.auditRetentionYears} years).`,
    href: `/customers?tab=batches`,
    roles: ["admin"],
    targetType: "anonymize_batch",
    targetId: batch.id,
    now,
  });
  return { batchId: batch.id, customers: candidates.length, payments, tokens, auditLogs: pruned.count, retentionMonths: settings.piiRetentionMonths, auditRetentionYears: settings.auditRetentionYears };
}
