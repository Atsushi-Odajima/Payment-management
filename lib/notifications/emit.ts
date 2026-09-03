// Operator notifications — the write side (Phase J's minimum, landed in
// Phase I so the payment-method switch can raise critical notices). The bell
// icon, read tracking, filters and e-mail / Slack fan-out come in Phase J.
//
// Duplicate suppression: the same kind for the same target is emitted at
// most once per 24 hours.

import type { Prisma, PrismaClient } from "@prisma/client";
import type { Role } from "@/lib/role";

export const NOTIFICATION_SEVERITIES = ["info", "warning", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_KINDS = [
  "payment_method.suspended",
  "payment_method.resumed",
  "webhook.abandoned",
  "batch.failed",
  "chargeback.deadline",
  "transfer.overdue",
  "cvs.overdue",
  "blacklist.candidate",
  "limit.exceeded",
  "subscription.payment_failed",
  "settlement.held",
  "settlement.generated",
  "refund.requested",
  "merchant.created",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

type Db = PrismaClient | Prisma.TransactionClient;

export interface EmitNotificationInput {
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href?: string | null;
  /** Roles that should see it; empty = everyone. */
  roles?: readonly Role[];
  targetType?: string | null;
  targetId?: string | null;
  now?: Date;
}

/** Creates the notification unless the same kind + target was emitted within the window. Returns the id, or null when suppressed. */
export async function emitNotification(db: Db, input: EmitNotificationInput): Promise<string | null> {
  const now = input.now ?? new Date();
  if (input.targetType && input.targetId) {
    const dup = await db.notification.findFirst({
      where: { kind: input.kind, targetType: input.targetType, targetId: input.targetId, createdAt: { gte: new Date(now.getTime() - DEDUPE_WINDOW_MS) } },
      select: { id: true },
    });
    if (dup) return null;
  }
  const row = await db.notification.create({
    data: {
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      roles: JSON.stringify(input.roles ?? []),
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      createdAt: now,
    },
    select: { id: true },
  });
  return row.id;
}
