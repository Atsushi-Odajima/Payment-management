// Payment method suspension (Phase I-3). Order of evaluation when a checkout
// asks for a method: global switch → merchant switch → the merchant's own
// enabled-method list. Every checkout path (dashboard, payment link,
// subscription charge, future public API / sandbox) goes through
// createTransaction, which calls assertMethodAvailable().

import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { emitNotification } from "@/lib/notifications/emit";
import { PAYMENT_METHODS, type PaymentMethod } from "./methods";

type Db = PrismaClient | Prisma.TransactionClient;

export { CONTROLLED_METHODS, CONTROL_SCOPES, isControlledMethod, methodControlInputSchema, type ControlledMethod, type ControlScope, type MethodControlInput, type MethodControlRow } from "./method-control-types";
import { CONTROLLED_METHODS, isControlledMethod, type MethodControlInput, type MethodControlRow } from "./method-control-types";

const SELECT = { id: true, scope: true, merchantId: true, method: true, suspended: true, reason: true, suspendedById: true, suspendedAt: true, resumeAt: true, resumedAt: true, updatedAt: true } as const;

function toRow(r: { scope: string; method: string } & Omit<MethodControlRow, "scope" | "method" | "suspendedByName">, names: Map<string, string> = new Map()): MethodControlRow {
  return { ...r, scope: r.scope === "global" ? "global" : "merchant", method: isControlledMethod(r.method) ? r.method : "credit", suspendedByName: r.suspendedById ? (names.get(r.suspendedById) ?? null) : null };
}

/** Operator names for the suspendedById values (plain string column, no relation). */
async function actorNames(db: Db, rows: ReadonlyArray<{ suspendedById: string | null }>): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.suspendedById).filter((x): x is string => x !== null))];
  if (ids.length === 0) return new Map();
  const admins = await db.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(admins.map((a) => [a.id, a.name]));
}

/** Methods currently suspended for a merchant (global ∪ merchant rows). */
export async function suspendedMethods(db: Db, merchantId: string | null): Promise<Set<PaymentMethod>> {
  const rows = await db.paymentMethodControl.findMany({
    where: { suspended: true, OR: [{ scope: "global" }, ...(merchantId ? [{ scope: "merchant", merchantId }] : [])] },
    select: { method: true },
  });
  return new Set(rows.map((r) => r.method).filter((m): m is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(m)));
}

/** 409 `method_suspended` when the method is switched off globally or for the merchant. */
export async function assertMethodAvailable(db: Db, opts: { merchantId: string | null; method: PaymentMethod }): Promise<void> {
  if (!isControlledMethod(opts.method)) return;
  const rows = await db.paymentMethodControl.findMany({
    where: { suspended: true, method: opts.method, OR: [{ scope: "global" }, ...(opts.merchantId ? [{ scope: "merchant", merchantId: opts.merchantId }] : [])] },
    select: { scope: true },
  });
  if (rows.length > 0) throw new ApiError(409, "method_suspended", "errors.methodSuspended", undefined, { scope: rows.some((r) => r.scope === "global") ? "global" : "merchant", method: opts.method });
}

/** All four global switches (missing rows = not suspended). */
export async function loadGlobalControls(db: Db): Promise<MethodControlRow[]> {
  const rows = await db.paymentMethodControl.findMany({ where: { scope: "global" }, select: SELECT });
  const names = await actorNames(db, rows);
  return CONTROLLED_METHODS.map((method) => {
    const r = rows.find((x) => x.method === method);
    return r ? toRow(r, names) : { id: `global:${method}`, scope: "global", merchantId: null, method, suspended: false, reason: null, suspendedById: null, suspendedByName: null, suspendedAt: null, resumeAt: null, resumedAt: null, updatedAt: new Date(0) };
  });
}

export async function loadMerchantControls(db: Db, merchantId: string): Promise<{ global: MethodControlRow[]; merchant: MethodControlRow[] }> {
  const [global, rows] = await Promise.all([loadGlobalControls(db), db.paymentMethodControl.findMany({ where: { scope: "merchant", merchantId }, select: SELECT })]);
  const names = await actorNames(db, rows);
  const merchant = CONTROLLED_METHODS.map((method) => {
    const r = rows.find((x) => x.method === method);
    return r ? toRow(r, names) : { id: `merchant:${merchantId}:${method}`, scope: "merchant" as const, merchantId, method, suspended: false, reason: null, suspendedById: null, suspendedByName: null, suspendedAt: null, resumeAt: null, resumedAt: null, updatedAt: new Date(0) };
  });
  return { global, merchant };
}

/** Suspend or resume one switch. Suspension needs a reason; both are audited and a global suspension raises a critical notification. */
export async function setMethodControl(db: PrismaClient, opts: { input: MethodControlInput; actorId: string; audit: AuditContext; now?: Date }): Promise<MethodControlRow> {
  const now = opts.now ?? new Date();
  const { scope, method, suspended } = opts.input;
  const merchantId = scope === "global" ? null : opts.input.merchantId!;
  if (merchantId) {
    const exists = await db.merchant.findUnique({ where: { id: merchantId }, select: { id: true, merchantCode: true } });
    if (!exists) throw new ApiError(404, "not_found", "errors.notFound");
  }
  const resumeAt = suspended && opts.input.resumeAt ? new Date(opts.input.resumeAt) : null;
  if (resumeAt && (Number.isNaN(resumeAt.getTime()) || resumeAt.getTime() <= now.getTime())) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { resumeAt: "future" } });
  }
  const before = await db.paymentMethodControl.findFirst({ where: { scope, merchantId, method }, select: SELECT });
  const data = suspended
    ? { suspended: true, reason: opts.input.reason, suspendedById: opts.actorId, suspendedAt: now, resumeAt, resumedAt: null }
    : { suspended: false, resumeAt: null, resumedAt: now };
  return db.$transaction(async (tx) => {
    const row = before
      ? await tx.paymentMethodControl.update({ where: { id: before.id }, data, select: SELECT })
      : await tx.paymentMethodControl.create({ data: { scope, merchantId, method, ...data }, select: SELECT });
    await recordAudit(tx, opts.audit, {
      action: suspended ? "payment_method.suspend" : "payment_method.resume",
      targetType: "payment_method_control",
      targetId: row.id,
      before: before ? { suspended: before.suspended, reason: before.reason, resumeAt: before.resumeAt } : null,
      after: { scope, merchantId, method, suspended, reason: opts.input.reason || null, resumeAt },
    });
    if (suspended) {
      await emitNotification(tx, {
        kind: "payment_method.suspended",
        severity: scope === "global" ? "critical" : "warning",
        title: scope === "global" ? `Payment method suspended: ${method}` : `Merchant payment method suspended: ${method}`,
        body: opts.input.reason,
        href: scope === "global" ? "/payment-method-controls" : `/merchants/${merchantId}?tab=methods`,
        roles: scope === "global" ? [] : ["admin", "cs"],
        targetType: "payment_method_control",
        targetId: row.id,
        now,
      });
    }
    return toRow(row);
  });
}

/** Cron: resume every switch whose resumeAt has passed. */
export async function resumeDueControls(db: PrismaClient, audit: AuditContext, now: Date = new Date()): Promise<{ resumed: number }> {
  const due = await db.paymentMethodControl.findMany({ where: { suspended: true, resumeAt: { lte: now } }, select: SELECT });
  for (const row of due) {
    await db.$transaction(async (tx) => {
      const updated = await tx.paymentMethodControl.updateMany({ where: { id: row.id, suspended: true }, data: { suspended: false, resumedAt: now, resumeAt: null } });
      if (updated.count === 0) return;
      await recordAudit(tx, audit, { action: "payment_method.resume", targetType: "payment_method_control", targetId: row.id, before: { suspended: true, resumeAt: row.resumeAt }, after: { suspended: false, auto: true } });
      await emitNotification(tx, { kind: "payment_method.resumed", severity: "info", title: `Payment method resumed automatically: ${row.method}`, body: row.reason ?? "", href: row.scope === "global" ? "/payment-method-controls" : `/merchants/${row.merchantId}?tab=methods`, targetType: "payment_method_control", targetId: row.id, now });
    });
  }
  return { resumed: due.length };
}
