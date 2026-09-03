// Client-safe deposit-difference vocabulary (the loader / actions in
// ./deposit-diffs.ts need Prisma and must not reach client bundles).

import type { DataMode } from "@/lib/mode";
import type { DepositDiff } from "@/lib/payments/transfer";

export const DEPOSIT_DIFF_STATUSES = ["open", "refund_arranged", "notified", "resolved"] as const;
export type DepositDiffStatus = (typeof DEPOSIT_DIFF_STATUSES)[number];
export function isDepositDiffStatus(v: unknown): v is DepositDiffStatus {
  return typeof v === "string" && (DEPOSIT_DIFF_STATUSES as readonly string[]).includes(v);
}

export const DEPOSIT_DIFF_ACTIONS = ["refund", "notify", "resolve"] as const;
export type DepositDiffAction = (typeof DEPOSIT_DIFF_ACTIONS)[number];
export function isDepositDiffAction(v: unknown): v is DepositDiffAction {
  return typeof v === "string" && (DEPOSIT_DIFF_ACTIONS as readonly string[]).includes(v);
}

export interface DepositDiffFilters {
  status: DepositDiffStatus | "";
  diff: DepositDiff | "";
  merchant: string;
  mode: DataMode;
}

export interface DepositDiffRow {
  id: string;
  orderNumber: string;
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  transferId: string | null;
  amount: number;
  depositAmount: number;
  /** Positive = excess, negative = short. */
  difference: number;
  diff: DepositDiff;
  diffStatus: DepositDiffStatus;
  paymentStatus: string;
  customerEmail: string | null;
  livemode: boolean;
  capturedAt: Date | null;
  updatedAt: Date;
}
