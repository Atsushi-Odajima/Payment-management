// Manual chapters in reading order. Each maps to content/manual/<lang>/<slug>.md
// and to a nav.manualChapters.<slug> title key.

export const MANUAL_CHAPTERS = [
  "intro",
  "dashboard",
  "merchants",
  "agents",
  "payments",
  "applications",
  "refunds",
  "settlements",
  "webhooks",
  "ip-restrictions",
  "notification-spec",
  "admins",
] as const;

export type ManualChapter = (typeof MANUAL_CHAPTERS)[number];

export function isManualChapter(v: unknown): v is ManualChapter {
  return typeof v === "string" && (MANUAL_CHAPTERS as readonly string[]).includes(v);
}
