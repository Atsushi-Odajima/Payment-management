// Validation for merchant input, shared by the form (inline errors) and the
// API (authoritative). Error messages are i18n keys resolved by the caller.

import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/payments/methods";
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

/** Example katakana value shown as the placeholder in both languages (the field itself is katakana-only). */
export const KANA_PLACEHOLDER = "\u30EF\u30A4\u30E4\u30FC\u30DA\u30A4 \u30B7\u30E7\u30C3\u30D7";

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
  // Optional on input (older clients omit them), always present on output.
  agentId: z.string().trim().min(1).max(64).nullable().default(null),
  enabledMethods: z
    .array(z.enum(PAYMENT_METHODS))
    .max(PAYMENT_METHODS.length)
    .default([])
    .transform((list) => Array.from(new Set(list))),
  transferIdDigits: z.union([z.literal(7), z.literal(8)]).default(7),
}) satisfies z.ZodType<MerchantInput, z.ZodTypeDef, unknown>;

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
  agentId: null,
  enabledMethods: [],
  transferIdDigits: 7,
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
