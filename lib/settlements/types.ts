// Settlement (精算) vocabulary: merchant settings, batch statuses and the
// zod schemas shared by the forms and the API (Phase D).

import { z } from "zod";

export const SETTLEMENT_CYCLES = ["monthly", "semimonthly", "weekly"] as const;
export type SettlementCycle = (typeof SETTLEMENT_CYCLES)[number];

export const PAYOUT_TERMS = ["next_month_end", "next_month_15", "month_after_next_15", "next_week"] as const;
export type PayoutTerm = (typeof PAYOUT_TERMS)[number];

export const BANK_ACCOUNT_TYPES = ["ordinary", "current"] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const SETTLEMENT_STATUSES = ["collecting", "confirmed", "scheduled", "paid", "held"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_ACTIONS = ["confirm", "schedule", "pay", "hold", "release"] as const;
export type SettlementAction = (typeof SETTLEMENT_ACTIONS)[number];

export const LINE_KINDS = ["payment", "refund", "chargeback"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

const includes = (list: readonly string[], v: unknown): boolean => typeof v === "string" && list.includes(v);
export const isSettlementCycle = (v: unknown): v is SettlementCycle => includes(SETTLEMENT_CYCLES, v);
export const isPayoutTerm = (v: unknown): v is PayoutTerm => includes(PAYOUT_TERMS, v);
export const isBankAccountType = (v: unknown): v is BankAccountType => includes(BANK_ACCOUNT_TYPES, v);
export const isSettlementStatus = (v: unknown): v is SettlementStatus => includes(SETTLEMENT_STATUSES, v);
export const isSettlementAction = (v: unknown): v is SettlementAction => includes(SETTLEMENT_ACTIONS, v);
export const isLineKind = (v: unknown): v is LineKind => includes(LINE_KINDS, v);

/** Legal status transitions of a batch; hold needs a reason, release undoes it. */
export const SETTLEMENT_TRANSITIONS: Record<SettlementAction, { from: readonly SettlementStatus[]; to: SettlementStatus }> = {
  confirm: { from: ["collecting"], to: "confirmed" },
  schedule: { from: ["confirmed"], to: "scheduled" },
  pay: { from: ["scheduled"], to: "paid" },
  hold: { from: ["confirmed", "scheduled"], to: "held" },
  release: { from: ["held"], to: "confirmed" },
};

export const settlementSettingsSchema = z.object({
  settlementCycle: z.enum(SETTLEMENT_CYCLES),
  payoutTerm: z.enum(PAYOUT_TERMS),
  bankName: z.string().trim().max(80, "tooLong").default(""),
  bankBranch: z.string().trim().max(80, "tooLong").default(""),
  bankAccountType: z.enum(BANK_ACCOUNT_TYPES).nullable().default(null),
  bankAccountNumber: z
    .string()
    .trim()
    .max(8, "tooLong")
    .refine((v) => v === "" || /^\d{7,8}$/.test(v), "digits")
    .default(""),
  bankAccountHolder: z.string().trim().max(80, "tooLong").default(""),
  settlementFee: z.number({ invalid_type_error: "number" }).int("integer").min(0, "range").max(10_000, "range").default(0),
});
export type SettlementSettingsInput = z.infer<typeof settlementSettingsSchema>;

export const generateBatchSchema = z.object({
  merchantId: z.string().min(1).max(64),
  /** YYYY-MM-DD (business time zone), inclusive. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
  /** YYYY-MM-DD, inclusive (stored as the exclusive next day). */
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
});

export const holdSchema = z.object({ reason: z.string().trim().min(1, "required").max(500, "tooLong") });
