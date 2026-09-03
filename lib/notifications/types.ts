// Notification centre vocabulary (Phase J). Client-safe.

import type { Role } from "@/lib/role";

export const NOTIFICATION_SEVERITIES = ["info", "warning", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];
export const isNotificationSeverity = (v: unknown): v is NotificationSeverity => typeof v === "string" && (NOTIFICATION_SEVERITIES as readonly string[]).includes(v);

/** Every kind the system emits, with its default severity (the emitter may override). */
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
export const isNotificationKind = (v: unknown): v is NotificationKind => typeof v === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(v);

export const NOTIFICATION_DEFAULT_SEVERITY: Record<NotificationKind, NotificationSeverity> = {
  "payment_method.suspended": "critical",
  "payment_method.resumed": "info",
  "webhook.abandoned": "critical",
  "batch.failed": "critical",
  "chargeback.deadline": "critical",
  "transfer.overdue": "warning",
  "cvs.overdue": "warning",
  "blacklist.candidate": "warning",
  "limit.exceeded": "warning",
  "subscription.payment_failed": "warning",
  "settlement.held": "warning",
  "settlement.generated": "info",
  "refund.requested": "info",
  "merchant.created": "info",
};

export const NOTIFICATION_CHANNELS = ["in_app", "email", "slack"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string | null;
  roles: Role[];
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationFilters {
  kind: NotificationKind | "";
  severity: NotificationSeverity | "";
  /** "" = all, "unread" | "read" */
  read: "" | "unread" | "read";
  from: string;
  to: string;
}

export interface PreferenceRow {
  kind: NotificationKind;
  email: boolean;
  slack: boolean;
}

/** Slack messages carry the severity as an emoji prefix; the text itself is the notification title / body. */
export const SEVERITY_EMOJI: Record<NotificationSeverity, string> = { info: ":information_source:", warning: ":warning:", critical: ":rotating_light:" };
