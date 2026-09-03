// Bank transfer (銀行振込) helpers: transfer ids, deadlines and deposit
// reconciliation (入金消込). Pure functions so the same rules run in the API,
// the seed and unit tests.

import type { PaymentStatus } from "./transitions";

export const TRANSFER_ID_DIGITS = [7, 8] as const;
export type TransferIdDigits = (typeof TRANSFER_ID_DIGITS)[number];
export const DEFAULT_TRANSFER_ID_DIGITS: TransferIdDigits = 7;

export function isTransferIdDigits(v: unknown): v is TransferIdDigits {
  return v === 7 || v === 8;
}

/** Days a customer has to complete the transfer after checkout. */
export const TRANSFER_DUE_DAYS = 7;

export const DEPOSIT_DIFFS = ["short", "excess"] as const;
export type DepositDiff = (typeof DEPOSIT_DIFFS)[number];

export function isDepositDiff(v: unknown): v is DepositDiff {
  return v === "short" || v === "excess";
}

/**
 * Random numeric transfer id of the requested length. The first digit is
 * never 0 so the id keeps its length when copied into a bank form. Uniqueness
 * is enforced by the database (Payment.transferId @unique) with one retry.
 */
export function generateTransferId(digits: TransferIdDigits, random: () => number = Math.random): string {
  let s = String(1 + Math.floor(random() * 9));
  while (s.length < digits) s += String(Math.floor(random() * 10));
  return s;
}

export function isTransferIdFormat(s: string): boolean {
  return /^[1-9]\d{6,7}$/.test(s);
}

export function transferDueDate(from: Date, days: number | undefined = TRANSFER_DUE_DAYS): Date {
  if (days === undefined) days = TRANSFER_DUE_DAYS;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** True when a transfer is still awaited but its deadline has passed. */
export function isTransferOverdue(
  p: { status: PaymentStatus | string; transferDueAt: Date | null },
  now: Date = new Date(),
): boolean {
  return p.status === "awaiting_transfer" && p.transferDueAt !== null && p.transferDueAt.getTime() < now.getTime();
}

export interface DepositOutcome {
  /** Cumulative amount received including this deposit. */
  total: number;
  status: Extract<PaymentStatus, "captured" | "awaiting_transfer">;
  diff: DepositDiff | null;
}

/**
 * Deposit reconciliation: exact → completed; short → stays awaiting with the short flag
 * (further deposits accumulate); excess → completed with the excess flag.
 */
export function reconcileDeposit(amount: number, alreadyDeposited: number, deposit: number): DepositOutcome {
  const total = alreadyDeposited + deposit;
  if (total < amount) return { total, status: "awaiting_transfer", diff: "short" };
  if (total === amount) return { total, status: "captured", diff: null };
  return { total, status: "captured", diff: "excess" };
}
