// Client-safe webhook delivery vocabulary (the delivery engine itself needs
// node:crypto and lives in ./deliver.ts, which client components must not import).

export const WEBHOOK_STATUSES = ["pending", "success", "failed", "retrying", "abandoned"] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export function isWebhookStatus(v: unknown): v is WebhookStatus {
  return typeof v === "string" && (WEBHOOK_STATUSES as readonly string[]).includes(v);
}

/** 1 min → 5 min → 30 min → 2 h → 24 h; after the 5th failure the delivery is abandoned. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 24 * 3_600_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
export const WEBHOOK_TIMEOUT_MS = 10_000;
