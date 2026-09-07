// Unmatched bank deposits (未消込入金) vocabulary and Zod schemas. Client-safe
// (no prisma / node:crypto) so views can import it.
//
// A deposit that arrives without a usable transfer id cannot be reconciled by
// the bank notification. Support attaches the right transfer id ("match"),
// which reconciles the transaction and re-notifies the merchant's API, or
// dismisses the deposit (refunded outside the system, duplicate, …).

import { z } from "zod";
import type { DataMode } from "@/lib/mode";

export const UNMATCHED_DEPOSIT_STATUSES = ["unmatched", "matched", "dismissed"] as const;
export type UnmatchedDepositStatus = (typeof UNMATCHED_DEPOSIT_STATUSES)[number];
export const isUnmatchedDepositStatus = (v: unknown): v is UnmatchedDepositStatus => typeof v === "string" && (UNMATCHED_DEPOSIT_STATUSES as readonly string[]).includes(v);

export const UNMATCHED_DEPOSIT_SOURCES = ["bank", "cvs", "manual"] as const;
export type UnmatchedDepositSource = (typeof UNMATCHED_DEPOSIT_SOURCES)[number];
export const isUnmatchedDepositSource = (v: unknown): v is UnmatchedDepositSource => typeof v === "string" && (UNMATCHED_DEPOSIT_SOURCES as readonly string[]).includes(v);

/** Why a notification with a valid id still ended here (Phase P1-2 / P1-3). */
export const UNMATCHED_DEPOSIT_REASONS = ["late_deposit", "cancelled_deposit", "mode_mismatch"] as const;
export type UnmatchedDepositReason = (typeof UNMATCHED_DEPOSIT_REASONS)[number];
export const isUnmatchedDepositReason = (v: unknown): v is UnmatchedDepositReason => typeof v === "string" && (UNMATCHED_DEPOSIT_REASONS as readonly string[]).includes(v);

/** Dismissal category: returned = 組戻し（返金）手配, other = anything else. */
export const DISMISS_KINDS = ["returned", "other"] as const;
export type DismissKind = (typeof DISMISS_KINDS)[number];

export const unmatchedDepositInputSchema = z.object({
  amount: z.number({ invalid_type_error: "number" }).int("integer").positive("range").max(99_999_999, "range"),
  payerName: z.string().trim().min(1, "required").max(120, "tooLong"),
  /** ISO date-time or "" (= now). */
  receivedAt: z.string().trim().max(40).default(""),
  bankReference: z.string().trim().max(80, "tooLong").default(""),
  givenTransferId: z.string().trim().max(20, "tooLong").default(""),
  note: z.string().trim().max(500, "tooLong").default(""),
});
export type UnmatchedDepositInput = z.infer<typeof unmatchedDepositInputSchema>;

export const matchDepositSchema = z.object({
  transferId: z.string().trim().regex(/^\d{7,8}$/, "format"),
});

export const dismissDepositSchema = z.object({
  reason: z.string().trim().min(1, "required").max(500, "tooLong"),
  kind: z.enum(DISMISS_KINDS).default("other"),
});

/** Apply a deposit that arrived after the transaction expired (late_deposit transition). Reason is mandatory. */
export const lateMatchDepositSchema = z.object({
  reason: z.string().trim().min(1, "required").max(500, "tooLong"),
});

export interface UnmatchedDepositRow {
  id: string;
  livemode: boolean;
  amount: number;
  payerName: string;
  receivedAt: Date;
  bankReference: string | null;
  givenTransferId: string | null;
  note: string | null;
  source: UnmatchedDepositSource;
  status: UnmatchedDepositStatus;
  reason: UnmatchedDepositReason | null;
  /** The transaction the deposit most likely belongs to (late / cancelled / other-mode). */
  candidatePayment: { id: string; orderNumber: string; status: string; livemode: boolean; method: string | null; transferId: string | null; cvsReceiptNo: string | null; merchant: { id: string; merchantCode: string; siteName: string } | null } | null;
  matchedTransferId: string | null;
  matchedAt: Date | null;
  dismissKind: DismissKind | null;
  dismissReason: string | null;
  payment: { id: string; orderNumber: string; status: string; merchant: { id: string; merchantCode: string; siteName: string } | null } | null;
  createdAt: Date;
}

/** An awaiting bank transfer that could be the deposit's target (same mode). */
export interface TransferCandidate {
  paymentId: string;
  transferId: string;
  orderNumber: string;
  amount: number;
  customerName: string | null;
  merchant: { merchantCode: string; siteName: string } | null;
  transferDueAt: Date | null;
  /** Amount equals the deposit amount. */
  exact: boolean;
  overdue: boolean;
  /** Transaction status (awaiting_transfer for ordinary candidates; expired / cancelled for the linked candidate). */
  status: string;
  livemode: boolean;
  /** The candidate belongs to the other mode and cannot be selected (Phase P1-2). */
  modeMismatch: boolean;
  /** The linked transaction already expired: only "apply as late deposit" can use it (Phase P1-3). */
  late: boolean;
}

export interface UnmatchedDepositFilters {
  status: UnmatchedDepositStatus | "";
  mode: DataMode;
}

export const UNMATCHED_DEPOSIT_SORT_KEYS = ["receivedAt", "amount", "status", "payerName"] as const;
