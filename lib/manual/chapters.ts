// Manual chapters in reading order. Each maps to content/manual/<lang>/<slug>.md
// and to a nav.manualChapters.<slug> title key.

export const MANUAL_CHAPTERS = [
  "intro",
  "roles",
  "dashboard",
  "payment-methods",
  "merchants",
  "customers",
  "agents",
  "payments",
  "applications",
  "konbini",
  "receipts",
  "refunds",
  "settlements",
  "webhooks",
  "risk",
  "reports",
  "emails",
  "announcements",
  "notifications",
  "subscriptions",
  "payment-links",
  "agent-fees",
  "ip-restrictions",
  "notification-spec",
  "public-api",
  "merchant-portal",
  "admins",
] as const;

export type ManualChapter = (typeof MANUAL_CHAPTERS)[number];

export function isManualChapter(v: unknown): v is ManualChapter {
  return typeof v === "string" && (MANUAL_CHAPTERS as readonly string[]).includes(v);
}
