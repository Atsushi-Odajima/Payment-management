// Audit trail (操作ログ). Every data-changing operation calls recordAudit()
// — ideally inside the same transaction as the change — with the actor, the
// action, the target and redacted before / after snapshots.

import type { Prisma, PrismaClient } from "@prisma/client";
import { clientIpFromHeaders } from "@/lib/ip";
import { currentAdminFromRequest } from "@/lib/admin/current";

export const AUDIT_ACTOR_TYPES = ["admin", "system", "webhook", "bank", "cron", "seed"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_TARGET_TYPES = [
  "merchant",
  "agent",
  "payment",
  "provider",
  "ip_restriction",
  "admin_user",
  "session",
  "demo",
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/** Known actions (filter options on the audit screen). New ones must be added here and to nav/i18n. */
export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "account.password_change",
  "account.totp_enable",
  "account.totp_disable",
  "admin.create",
  "admin.update",
  "admin.password_reset",
  "admin.totp_reset",
  "merchant.create",
  "merchant.update",
  "merchant.password_regenerate",
  "agent.create",
  "agent.update",
  "payment.create",
  "payment.capture",
  "payment.cancel",
  "payment.refund",
  "payment.fail",
  "payment.expire",
  "payment.deposit",
  "provider.create",
  "provider.update",
  "provider.delete",
  "ip_restriction.create",
  "ip_restriction.update",
  "ip_restriction.delete",
  "demo.reset",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(v: unknown): v is AuditAction {
  return typeof v === "string" && (AUDIT_ACTIONS as readonly string[]).includes(v);
}
export function isAuditTargetType(v: unknown): v is AuditTargetType {
  return typeof v === "string" && (AUDIT_TARGET_TYPES as readonly string[]).includes(v);
}

export type AuditActor = { type: "admin"; id: string } | { type: Exclude<AuditActorType, "admin"> };

export interface AuditContext {
  actor: AuditActor;
  ip: string | null;
}

export interface AuditEntry {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
}

type Db = PrismaClient | Prisma.TransactionClient;

const SENSITIVE_KEY = /password|passwordEnc|passwordHash|credentials|secret|totp/i;

/** Drop secrets and make Dates / bigints JSON-safe. */
export function redactForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        if (v !== null && v !== undefined) out[k] = "[redacted]";
        continue;
      }
      out[k] = redactForAudit(v);
    }
    return out;
  }
  return value;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(redactForAudit(value));
}

/** Write one audit row. Pass the transaction client when the change is transactional. */
export async function recordAudit(db: Db, ctx: AuditContext, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: ctx.actor.type,
      actorId: ctx.actor.type === "admin" ? ctx.actor.id : null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      before: serialize(entry.before),
      after: serialize(entry.after),
      ip: ctx.ip,
    },
  });
}

export function requestIp(req: Request): string | null {
  return clientIpFromHeaders((n) => req.headers.get(n));
}

/** Audit context for a dashboard request: the signed-in admin (or "system" when anonymous). */
export async function auditContextFromRequest(req: Request): Promise<AuditContext> {
  const admin = await currentAdminFromRequest(req);
  return { actor: admin ? { type: "admin", id: admin.id } : { type: "system" }, ip: requestIp(req) };
}

/** Context for non-interactive actors (webhooks, the bank notification, cron, seed). */
export function systemAuditContext(type: Exclude<AuditActorType, "admin">, ip: string | null = null): AuditContext {
  return { actor: { type }, ip };
}
