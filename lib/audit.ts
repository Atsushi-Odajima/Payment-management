// Audit trail (操作ログ). Every data-changing operation calls recordAudit()
// — ideally inside the same transaction as the change — with the actor, the
// action, the target and redacted before / after snapshots.

import type { Prisma, PrismaClient } from "@prisma/client";
import { clientIpFromHeaders } from "@/lib/ip";
import { currentAdminFromRequest } from "@/lib/admin/current";

export const AUDIT_ACTOR_TYPES = ["admin", "merchant", "system", "webhook", "bank", "cvs", "cron", "seed"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_TARGET_TYPES = [
  "receipt",
  "payment_method_control",
  "global_setting",
  "unmatched_deposit",
  "merchant",
  "agent",
  "payment",
  "provider",
  "ip_restriction",
  "api_key",
  "refund",
  "settlement",
  "webhook_delivery",
  "chargeback",
  "blacklist",
  "risk_setting",
  "email_template",
  "announcement",
  "plan",
  "subscription",
  "payment_link",
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
  "merchant.fee_update",
  "merchant.limit_update",
  "merchant.terms_update",
  "api_key.issue",
  "api_key.rotate",
  "api_key.revoke",
  "agent.create",
  "agent.update",
  "payment.create",
  "payment.capture",
  "payment.cancel",
  "payment.refund",
  "payment.fail",
  "payment.expire",
  "payment.deposit",
  "payment.chargeback",
  "refund.request",
  "refund.approve",
  "refund.reject",
  "merchant.settlement_update",
  "settlement.generate",
  "settlement.confirm",
  "settlement.schedule",
  "settlement.pay",
  "settlement.hold",
  "settlement.release",
  "settlement.delete",
  "webhook.resend",
  "chargeback.create",
  "chargeback.dispute",
  "chargeback.resolve",
  "chargeback.confirm",
  "blacklist.create",
  "blacklist.update",
  "risk.settings_update",
  "payment.deposit_diff_update",
  "email_template.update",
  "announcement.create",
  "announcement.update",
  "announcement.publish",
  "announcement.end",
  "announcement.add_update",
  "plan.create",
  "plan.update",
  "subscription.create",
  "subscription.charge",
  "subscription.pause",
  "subscription.resume",
  "subscription.cancel",
  "payment_link.create",
  "payment_link.disable",
  "deposit.register",
  "deposit.match",
  "deposit.dismiss",
  "payment.renotify",
  "payment.note_delete",
  "payment_method.suspend",
  "payment_method.resume",
  "global_setting.update",
  "receipt.issue",
  "settlement.invoice_export",
  "merchant.login",
  "merchant.logout",
  "merchant.lockout",
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

/** Operators carry their AdminUser id; merchants (public API / portal, Phase L) their Merchant id. */
export type AuditActor = { type: "admin"; id: string } | { type: "merchant"; id: string } | { type: Exclude<AuditActorType, "admin" | "merchant"> };

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
      merchantId: ctx.actor.type === "merchant" ? ctx.actor.id : null,
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
export function systemAuditContext(type: Exclude<AuditActorType, "admin" | "merchant">, ip: string | null = null): AuditContext {
  return { actor: { type }, ip };
}

/** Context for a merchant acting through the public API or the merchant portal (Phase L). */
export function merchantAuditContext(merchantId: string, ip: string | null = null): AuditContext {
  return { actor: { type: "merchant", id: merchantId }, ip };
}
