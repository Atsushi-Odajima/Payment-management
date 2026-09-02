import { z } from "zod";
import { isValidCidr } from "@/lib/ip";
import { IP_TARGETS, type IpRestrictionInput } from "./types";

export const ipRestrictionInputSchema = z
  .object({
    target: z.enum(IP_TARGETS),
    merchantId: z.string().trim().min(1).max(64).nullable().default(null),
    cidr: z.string().trim().min(1, "required").max(43, "tooLong").refine(isValidCidr, "cidr"),
    label: z.string().trim().min(1, "required").max(80, "tooLong"),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.target === "merchant_api" && !v.merchantId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["merchantId"], message: "required" });
    }
  }) satisfies z.ZodType<IpRestrictionInput, z.ZodTypeDef, unknown>;

export type IpFieldKey = keyof IpRestrictionInput;
export type IpErrorCode = "required" | "tooLong" | "cidr" | "invalid";

export function validateIpRestrictionInput(
  input: unknown,
): { ok: true; data: IpRestrictionInput } | { ok: false; errors: Partial<Record<IpFieldKey, IpErrorCode>> } {
  const result = ipRestrictionInputSchema.safeParse(input);
  if (result.success) {
    // Admin rules never carry a merchant.
    const data = result.data.target === "admin" ? { ...result.data, merchantId: null } : result.data;
    return { ok: true, data };
  }
  const errors: Partial<Record<IpFieldKey, IpErrorCode>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as IpFieldKey | undefined;
    if (!key || errors[key]) continue;
    errors[key] = (["required", "tooLong", "cidr"].includes(issue.message) ? issue.message : "invalid") as IpErrorCode;
  }
  return { ok: false, errors };
}

export const EMPTY_IP_INPUT: IpRestrictionInput = {
  target: "admin",
  merchantId: null,
  cidr: "",
  label: "",
  enabled: true,
};
