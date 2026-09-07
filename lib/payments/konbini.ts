// Konbini (コンビニ決済) helpers (Phase K-1): store brands, the 13-digit
// payment slip number (受付番号) the customer quotes at the till and the
// payment deadline. Pure functions shared by the API, the seed and tests.
//
// Lifecycle: a konbini transaction starts `awaiting_payment` (支払待ち) with a
// receipt number and a deadline (Payment.transferDueAt, shared with bank
// transfers). The store's payment notification — POST /api/demo/cvs-notify,
// or the demo "pay" button on the hosted page — runs the same `deposit`
// action as a bank deposit and lands on `captured`; the hourly expiry cron
// turns overdue slips into `expired`.

import type { PaymentStatus } from "./transitions";

export const CVS_BRANDS = ["seven", "lawson", "familymart", "ministop", "other"] as const;
export type CvsBrand = (typeof CVS_BRANDS)[number];
export const DEFAULT_CVS_BRAND: CvsBrand = "seven";

export function isCvsBrand(v: unknown): v is CvsBrand {
  return typeof v === "string" && (CVS_BRANDS as readonly string[]).includes(v);
}

/** Days a customer has to pay at the counter (merchant default, Merchant.cvsDueDays). */
export const CVS_DUE_DAYS = 3;
export const CVS_DUE_LIMITS = { min: 1, max: 30 } as const;

export const CVS_RECEIPT_NO_LENGTH = 13;

/** Random 13-digit receipt number; the first digit is never 0 so it keeps its length everywhere. */
export function generateCvsReceiptNo(random: () => number = Math.random): string {
  let s = String(1 + Math.floor(random() * 9));
  while (s.length < CVS_RECEIPT_NO_LENGTH) s += String(Math.floor(random() * 10));
  return s;
}

export function isCvsReceiptNoFormat(s: string): boolean {
  return /^[1-9]\d{12}$/.test(s);
}

export function cvsDueDate(from: Date, days: number | undefined = CVS_DUE_DAYS): Date {
  if (days === undefined) days = CVS_DUE_DAYS;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** A konbini slip still waiting for payment (awaiting_payment, Phase P1-6). */
export function isCvsWaiting(p: { status: PaymentStatus | string; cvsReceiptNo: string | null }): boolean {
  return p.status === "awaiting_payment" && p.cvsReceiptNo !== null;
}

/** Group receipt numbers in blocks of 4-4-5 for display (1234-5678-90123). */
export function formatCvsReceiptNo(no: string): string {
  return no.length === CVS_RECEIPT_NO_LENGTH ? `${no.slice(0, 4)}-${no.slice(4, 8)}-${no.slice(8)}` : no;
}
