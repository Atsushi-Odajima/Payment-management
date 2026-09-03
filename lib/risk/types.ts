// Fraud / risk vocabulary (Phase F-2): blacklist kinds, sources, statuses,
// the detection thresholds and the pseudo card fingerprint.

import { z } from "zod";

export const BLACKLIST_KINDS = ["card", "ip", "email"] as const;
export type BlacklistKind = (typeof BLACKLIST_KINDS)[number];

export const BLACKLIST_SOURCES = ["auto", "manual"] as const;
export type BlacklistSource = (typeof BLACKLIST_SOURCES)[number];

export const BLACKLIST_STATUSES = ["candidate", "active", "disabled", "rejected"] as const;
export type BlacklistStatus = (typeof BLACKLIST_STATUSES)[number];

const includes = (list: readonly string[], v: unknown): boolean => typeof v === "string" && list.includes(v);
export const isBlacklistKind = (v: unknown): v is BlacklistKind => includes(BLACKLIST_KINDS, v);
export const isBlacklistSource = (v: unknown): v is BlacklistSource => includes(BLACKLIST_SOURCES, v);
export const isBlacklistStatus = (v: unknown): v is BlacklistStatus => includes(BLACKLIST_STATUSES, v);

export const CARD_BRANDS = ["visa", "mastercard", "jcb", "amex", "diners"] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

/** Card details accepted at checkout (demo: only a fingerprint and last 4 are stored). */
export const cardInputSchema = z.object({
  brand: z.enum(CARD_BRANDS),
  last4: z.string().regex(/^\d{4}$/, "digits"),
  /** MM/YY */
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "expiry"),
});
export type CardInput = z.infer<typeof cardInputSchema>;

export const blacklistCreateSchema = z.object({
  kind: z.enum(BLACKLIST_KINDS),
  value: z.string().trim().min(1, "required").max(200, "tooLong"),
  reason: z.string().trim().max(500, "tooLong").default(""),
});

export const blacklistUpdateSchema = z.object({
  status: z.enum(BLACKLIST_STATUSES),
  reason: z.string().trim().max(500, "tooLong").optional(),
});

export const riskSettingsSchema = z.object({
  windowMinutes: z.number({ invalid_type_error: "number" }).int("integer").min(1, "range").max(1440, "range"),
  maxFailures: z.number({ invalid_type_error: "number" }).int("integer").min(2, "range").max(100, "range"),
});
export type RiskSettingsInput = z.infer<typeof riskSettingsSchema>;

export const RISK_SETTINGS_ID = "global";
export const DEFAULT_RISK_SETTINGS: RiskSettingsInput = { windowMinutes: 10, maxFailures: 3 };

export const BLOCKED_FAILURE_PREFIX = "blocked:";

/** Normalise an email / IP for matching. */
export function normalizeBlacklistValue(kind: BlacklistKind, value: string): string {
  const v = value.trim();
  return kind === "email" ? v.toLowerCase() : v;
}
