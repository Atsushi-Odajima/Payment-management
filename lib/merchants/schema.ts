// Validation for merchant input, shared by the form (inline errors) and the
// API (authoritative). Error messages are i18n keys resolved by the caller.

import { z } from "zod";
import {
  EMAIL_NOTIFICATIONS,
  NOTIFY_FORMATS,
  NOTIFY_ID_FORMATS,
  NOTIFY_PARAM_SETS,
  type MerchantInput,
} from "./types";

/**
 * Full-width katakana (U+30A1–U+30FA), prolonged sound mark (U+30FC) and
 * full-/half-width spaces. Written with escapes so source files stay free of
 * raw Japanese text (see scripts/check-i18n.mjs).
 */
export const KATAKANA_RE = /^[\u30A1-\u30FA\u30FC\u3000 ]+$/u;

const HTTPS_RE = /^https:\/\/[^\s/$.?#].[^\s]*$/i;

const text = (max: number) => z.string().trim().min(1, "required").max(max, "tooLong");

export const merchantInputSchema = z.object({
  siteName: text(120),
  siteNameKana: text(120).regex(KATAKANA_RE, "katakana"),
  companyName: text(120),
  contactName: text(80),
  email: z.string().trim().min(1, "required").email("email").max(200, "tooLong"),
  statementEmail: z.string().trim().min(1, "required").email("email").max(200, "tooLong"),
  notifyUrl: z.string().trim().min(1, "required").max(500, "tooLong").regex(HTTPS_RE, "https"),
  notifyFormat: z.enum(NOTIFY_FORMATS),
  notifyParamSet: z.enum(NOTIFY_PARAM_SETS),
  notifyIdFormat: z.enum(NOTIFY_ID_FORMATS),
  emailNotification: z.enum(EMAIL_NOTIFICATIONS),
}) satisfies z.ZodType<MerchantInput>;

export type MerchantFieldKey = keyof MerchantInput;

/** i18n-key style error codes produced by the schema. */
export type MerchantErrorCode = "required" | "tooLong" | "katakana" | "email" | "https" | "invalid";

/** Validate and return per-field error codes (first error per field). */
export function validateMerchantInput(
  input: unknown,
): { ok: true; data: MerchantInput } | { ok: false; errors: Partial<Record<MerchantFieldKey, MerchantErrorCode>> } {
  const result = merchantInputSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: Partial<Record<MerchantFieldKey, MerchantErrorCode>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as MerchantFieldKey | undefined;
    if (!key || errors[key]) continue;
    const code = issue.message;
    errors[key] =
      code === "required" || code === "tooLong" || code === "katakana" || code === "email" || code === "https"
        ? code
        : "invalid";
  }
  return { ok: false, errors };
}

export const EMPTY_MERCHANT_INPUT: MerchantInput = {
  siteName: "",
  siteNameKana: "",
  companyName: "",
  contactName: "",
  email: "",
  statementEmail: "",
  notifyUrl: "",
  notifyFormat: "json_post",
  notifyParamSet: "standard",
  notifyIdFormat: "payment_id",
  emailNotification: "per_payment",
};

export const REQUIRED_MERCHANT_FIELDS: readonly MerchantFieldKey[] = [
  "siteName",
  "siteNameKana",
  "companyName",
  "contactName",
  "email",
  "statementEmail",
  "notifyUrl",
];
