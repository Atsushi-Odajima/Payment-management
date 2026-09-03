// Operator notifications — the write side (Phase J). Every event that should
// reach operators calls emitNotification(); the bell, the list, read tracking
// and the e-mail / Slack fan-out (./deliver.ts) read the rows it creates.
//
// Duplicate suppression: the same kind for the same target is emitted at
// most once per 24 hours.
//
// Fan-out runs right away when the caller passes the root PrismaClient; when
// called inside a transaction the row stays "pending" (dispatchedAt null) and
// the hourly notifications cron (or the next emit from the root client)
// dispatches it after the transaction committed.

import type { Prisma, PrismaClient } from "@prisma/client";
import type { Role } from "@/lib/role";
import { NOTIFICATION_DEFAULT_SEVERITY, type NotificationKind, type NotificationSeverity } from "./types";

export { NOTIFICATION_KINDS, NOTIFICATION_SEVERITIES, type NotificationKind, type NotificationSeverity } from "./types";

export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

type Db = PrismaClient | Prisma.TransactionClient;

export interface EmitNotificationInput {
  kind: NotificationKind;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  href?: string | null;
  /** Roles that should see it; empty = everyone. */
  roles?: readonly Role[];
  targetType?: string | null;
  targetId?: string | null;
  now?: Date;
}

function isRootClient(db: Db): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

/** Creates the notification unless the same kind + target was emitted within the window. Returns the id, or null when suppressed. Never throws. */
export async function emitNotification(db: Db, input: EmitNotificationInput): Promise<string | null> {
  try {
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
        severity: input.severity ?? NOTIFICATION_DEFAULT_SEVERITY[input.kind],
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
    if (isRootClient(db)) {
      const { dispatchPendingNotifications } = await import("./deliver");
      await dispatchPendingNotifications(db).catch((e) => console.error("[notifications] dispatch failed", e));
    }
    return row.id;
  } catch (e) {
    console.error("[notifications] emit failed", e);
    return null;
  }
}
