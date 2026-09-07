// Deposit notification log (入金通知ログ, Phase P1-1) vocabulary and the Zod
// schemas of the two demo notification endpoints. Client-safe.
//
// Every bank / konbini notification is recorded, whether or not it could be
// applied, and re-sent notifications are answered idempotently (see
// ./notify.ts for the dedupe key).

import { z } from "zod";
import type { DataMode } from "@/lib/mode";

export const DEPOSIT_NOTIFICATION_SOURCES = ["bank", "cvs"] as const;
export type DepositNotificationSource = (typeof DEPOSIT_NOTIFICATION_SOURCES)[number];
export const isDepositNotificationSource = (v: unknown): v is DepositNotificationSource => typeof v === "string" && (DEPOSIT_NOTIFICATION_SOURCES as readonly string[]).includes(v);

export const DEPOSIT_NOTIFICATION_RESULTS = ["applied", "duplicate", "unmatched", "rejected"] as const;
export type DepositNotificationResult = (typeof DEPOSIT_NOTIFICATION_RESULTS)[number];
export const isDepositNotificationResult = (v: unknown): v is DepositNotificationResult => typeof v === "string" && (DEPOSIT_NOTIFICATION_RESULTS as readonly string[]).includes(v);

/** Why a notification ended as unmatched / rejected. */
export const DEPOSIT_NOTIFICATION_REASONS = ["mode_mismatch", "late_deposit", "cancelled_deposit", "not_found", "no_id", "invalid_status", "apply_failed"] as const;
export type DepositNotificationReason = (typeof DEPOSIT_NOTIFICATION_REASONS)[number];

export const EVENT_ID_MAX = 128;

const eventId = z.string().trim().min(1).max(EVENT_ID_MAX).optional();
const mode = z.enum(["test", "live"]);

/** POST /api/demo/deposit-notify (bank). `mode` is mandatory (Phase P1-2). */
export const bankNotifySchema = z.object({
  eventId,
  /** The transfer id the customer wrote on the remittance (7 or 8 digits). Missing or unknown → unmatched deposit. */
  transferId: z.string().trim().max(20).optional().default(""),
  amount: z.number().int().positive().max(99_999_999),
  payerName: z.string().trim().max(120).optional().default(""),
  bankReference: z.string().trim().max(80).optional().default(""),
  /** ISO date-time of the deposit; defaults to now. */
  receivedAt: z.string().trim().max(40).optional().default(""),
  mode,
});
export type BankNotifyInput = z.infer<typeof bankNotifySchema>;

/** POST /api/demo/cvs-notify (konbini). `mode` is mandatory (Phase P1-2). */
export const cvsNotifySchema = z.object({
  eventId,
  /** The 13-digit receipt number printed on the slip (hyphens allowed). */
  receiptNo: z.string().trim().max(20),
  /** Amount paid at the counter; defaults to the slip amount. */
  amount: z.number().int().positive().max(99_999_999).optional(),
  receivedAt: z.string().trim().max(40).optional().default(""),
  mode,
});
export type CvsNotifyInput = z.infer<typeof cvsNotifySchema>;

export interface DepositNotificationRow {
  id: string;
  notificationNo: string;
  source: DepositNotificationSource;
  eventId: string | null;
  livemode: boolean;
  transferId: string | null;
  cvsReceiptNo: string | null;
  amount: number;
  receivedAt: Date;
  payerName: string | null;
  bankReference: string | null;
  result: DepositNotificationResult;
  resultReason: string | null;
  paymentId: string | null;
  unmatchedDepositId: string | null;
  duplicateOfId: string | null;
  createdAt: Date;
  payment: { id: string; orderNumber: string; status: string; merchant: { merchantCode: string; siteName: string } | null } | null;
}

export interface DepositNotificationFilters {
  source: DepositNotificationSource | "";
  result: DepositNotificationResult | "";
  /** YYYY-MM-DD (business time zone), inclusive. */
  from: string;
  to: string;
  mode: DataMode;
}

export const DEPOSIT_NOTIFICATION_SORT_KEYS = ["createdAt", "receivedAt", "amount", "result"] as const;
