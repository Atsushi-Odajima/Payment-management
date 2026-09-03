import { z } from "zod";
import { ADMIN_STATUSES, LOGIN_ID_RE, PASSWORD_MIN_LENGTH, type AdminCreateInput, type AdminInput } from "./types";

const roleSchema = z.enum(["master", "general"]);

export const adminInputSchema = z.object({
  name: z.string().trim().min(1, "required").max(80, "tooLong"),
  email: z.string().trim().toLowerCase().min(1, "required").email("email").max(200, "tooLong"),
  role: roleSchema,
  status: z.enum(ADMIN_STATUSES),
}) satisfies z.ZodType<AdminInput>;

// Login ids are case-insensitive: normalized to lower case before the format check.
export const adminCreateSchema = adminInputSchema.extend({
  loginId: z.string().trim().toLowerCase().min(1, "required").max(32, "tooLong").regex(LOGIN_ID_RE, "loginId"),
}) satisfies z.ZodType<AdminCreateInput>;

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH, "passwordShort").max(200, "tooLong");

export type AdminFieldKey = keyof AdminCreateInput;
export type AdminErrorCode = "required" | "tooLong" | "email" | "loginId" | "taken" | "passwordShort" | "invalid";

const KNOWN: readonly string[] = ["required", "tooLong", "email", "loginId", "passwordShort"];

function collect<K extends string>(issues: z.ZodIssue[]): Partial<Record<K, AdminErrorCode>> {
  const errors: Partial<Record<K, AdminErrorCode>> = {};
  for (const issue of issues) {
    const key = issue.path[0] as K | undefined;
    if (!key || errors[key]) continue;
    errors[key] = (KNOWN.includes(issue.message) ? issue.message : "invalid") as AdminErrorCode;
  }
  return errors;
}

export function validateAdminInput(
  input: unknown,
): { ok: true; data: AdminInput } | { ok: false; errors: Partial<Record<AdminFieldKey, AdminErrorCode>> } {
  const r = adminInputSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: collect<AdminFieldKey>(r.error.issues) };
}

export function validateAdminCreate(
  input: unknown,
): { ok: true; data: AdminCreateInput } | { ok: false; errors: Partial<Record<AdminFieldKey, AdminErrorCode>> } {
  const r = adminCreateSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: collect<AdminFieldKey>(r.error.issues) };
}

export const EMPTY_ADMIN_CREATE: AdminCreateInput = {
  loginId: "",
  name: "",
  email: "",
  role: "general",
  status: "invited",
};

export const REQUIRED_ADMIN_FIELDS: readonly AdminFieldKey[] = ["loginId", "name", "email"];
