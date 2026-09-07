// Receipts (領収書, Phase K-2): one row per completed transaction. The number
// (RC-YYYYMM-00001, per month) is assigned on the first issue; a re-issue
// keeps the number, bumps reissueCount and is stamped on the PDF. Every
// issue is audited (receipt.issue). Customers downloading from the hosted
// page create the row on first download (source "customer") and never count
// as re-issues.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/ids";
import { partsInTz } from "@/lib/settlements/schedule";
import { RECEIPT_STATUSES } from "./statuses";

export { RECEIPT_STATUSES };

export const RECEIPT_SELECT = {
  id: true,
  receiptNo: true,
  paymentId: true,
  merchantId: true,
  livemode: true,
  recipientName: true,
  amount: true,
  description: true,
  source: true,
  issuedById: true,
  reissueCount: true,
  issuedAt: true,
  lastIssuedAt: true,
} as const;

export type ReceiptRow = { id: string; receiptNo: string; paymentId: string; merchantId: string | null; livemode: boolean; recipientName: string; amount: number; source: string; issuedById: string | null; reissueCount: number; issuedAt: Date; lastIssuedAt: Date };

export function receiptMonthPrefix(now: Date): string {
  const p = partsInTz(now);
  return `RC-${p.y}${String(p.m).padStart(2, "0")}-`;
}

/** Next sequential number of the month (RC-YYYYMM-00001 …). */
export async function nextReceiptNo(db: PrismaClient, now: Date): Promise<string> {
  const prefix = receiptMonthPrefix(now);
  const last = await db.receipt.findFirst({ where: { receiptNo: { startsWith: prefix } }, orderBy: { receiptNo: "desc" }, select: { receiptNo: true } });
  const n = last ? Number(last.receiptNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

/** Amount a receipt certifies: what the customer actually paid net of refunds. */
export function receiptAmount(p: { amount: number; amountRefunded: number }): number {
  return p.amount - p.amountRefunded;
}

export const RECEIPT_SOURCES = ["dashboard", "customer", "merchant"] as const;
export type ReceiptSource = (typeof RECEIPT_SOURCES)[number];

export interface IssueReceiptInput {
  paymentId: string;
  /** 宛名; defaults to the customer name, then "上様" is left to the operator. */
  recipientName?: string | null;
  /** 但し書き (Phase P3-8); empty keeps the previous value, null / undefined on first issue = default wording. */
  description?: string | null;
  /** dashboard (operator) | customer (hosted page download) | merchant (merchant portal, Phase P3-8). */
  source: ReceiptSource;
  issuedById: string | null;
  audit: AuditContext;
  now?: Date;
}

export async function issueReceipt(db: PrismaClient, input: IssueReceiptInput): Promise<ReceiptRow> {
  const now = input.now ?? new Date();
  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, status: true, amount: true, amountRefunded: true, customerName: true, merchantId: true, livemode: true, receipt: { select: RECEIPT_SELECT } },
  });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (!RECEIPT_STATUSES.includes(payment.status)) throw new ApiError(409, "receipt_not_completed", "errors.receiptNotCompleted");
  const recipientName = (input.recipientName ?? "").trim() || payment.receipt?.recipientName || payment.customerName || "";
  const description = (input.description ?? "").trim() || payment.receipt?.description || null;
  const amount = receiptAmount(payment);

  if (payment.receipt) {
    // Customer re-downloads are not re-issues; operator / merchant re-issues are counted and audited.
    if (input.source === "customer") return payment.receipt;
    return db.$transaction(async (tx) => {
      const row = await tx.receipt.update({ where: { id: payment.receipt!.id }, data: { recipientName, description, amount, reissueCount: { increment: 1 }, lastIssuedAt: now }, select: RECEIPT_SELECT });
      await recordAudit(tx, input.audit, { action: "receipt.issue", targetType: "receipt", targetId: row.id, before: { receiptNo: row.receiptNo, reissueCount: payment.receipt!.reissueCount, recipientName: payment.receipt!.recipientName, description: payment.receipt!.description }, after: { receiptNo: row.receiptNo, reissueCount: row.reissueCount, recipientName, description, amount, reissue: true, source: input.source } });
      return row;
    });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const receiptNo = await nextReceiptNo(db, now);
        const row = await tx.receipt.create({
          data: { receiptNo, paymentId: payment.id, merchantId: payment.merchantId, livemode: payment.livemode, recipientName, description, amount, source: input.source, issuedById: input.issuedById, issuedAt: now, lastIssuedAt: now },
          select: RECEIPT_SELECT,
        });
        await recordAudit(tx, input.audit, { action: "receipt.issue", targetType: "receipt", targetId: row.id, after: { receiptNo, paymentId: payment.id, recipientName, description, amount, source: input.source, reissue: false } });
        return row;
      });
    } catch (e) {
      if (attempt === 0 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
  throw new ApiError(409, "conflict", "errors.conflict");
}
