import { z } from "zod";
import { KATAKANA_RE } from "@/lib/merchants/schema";
import { AGENT_STATUSES, type AgentInput } from "./types";

const text = (max: number) => z.string().trim().min(1, "required").max(max, "tooLong");

export const agentInputSchema = z.object({
  name: text(120),
  nameKana: text(120).regex(KATAKANA_RE, "katakana"),
  companyName: text(120),
  contactName: text(80),
  email: z.string().trim().min(1, "required").email("email").max(200, "tooLong"),
  feeRate: z
    .number({ invalid_type_error: "number" })
    .min(0, "range")
    .max(100, "range")
    .refine((v) => Math.round(v * 100) === v * 100, "decimals"),
  status: z.enum(AGENT_STATUSES),
}) satisfies z.ZodType<AgentInput>;

export type AgentFieldKey = keyof AgentInput;
export type AgentErrorCode = "required" | "tooLong" | "katakana" | "email" | "number" | "range" | "decimals" | "invalid";

const KNOWN: readonly string[] = ["required", "tooLong", "katakana", "email", "number", "range", "decimals"];

export function validateAgentInput(
  input: unknown,
): { ok: true; data: AgentInput } | { ok: false; errors: Partial<Record<AgentFieldKey, AgentErrorCode>> } {
  const result = agentInputSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: Partial<Record<AgentFieldKey, AgentErrorCode>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as AgentFieldKey | undefined;
    if (!key || errors[key]) continue;
    errors[key] = (KNOWN.includes(issue.message) ? issue.message : "invalid") as AgentErrorCode;
  }
  return { ok: false, errors };
}

export const EMPTY_AGENT_INPUT: AgentInput = {
  name: "",
  nameKana: "",
  companyName: "",
  contactName: "",
  email: "",
  feeRate: 0,
  status: "active",
};

export const REQUIRED_AGENT_FIELDS: readonly AgentFieldKey[] = ["name", "nameKana", "companyName", "contactName", "email"];
