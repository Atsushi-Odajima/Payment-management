// Server-side loader for the transaction detail, shared by
// /payments/[id] and /applications/[id]. Never passes provider credentials
// to the client — only whether a webhook secret exists.

import { prisma } from "@/lib/db";
import { NOTE_SELECT, type NoteRow } from "./notes";
import { storedFieldKeys } from "@/lib/providers/credentials";
import { toPaymentMethod, type PaymentMethod } from "@/lib/payments/methods";
import { toPaymentStatus, type PaymentStatus } from "@/lib/payments/transitions";
import { isDepositDiff, isTransferOverdue, type DepositDiff } from "@/lib/payments/transfer";

export interface PaymentEventItem {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  amount: number | null;
  actor: string;
  createdAt: Date;
}

export interface RefundItem {
  id: string;
  amount: number;
  kind: string;
  reasonCode: string;
  reason: string | null;
  status: string;
  forced: boolean;
  createdAt: Date;
}

export interface TransactionDetail {
  id: string;
  orderNumber: string;
  amount: number;
  amountRefunded: number;
  status: PaymentStatus;
  livemode: boolean;
  externalId: string | null;
  method: PaymentMethod;
  productName: string | null;
  customerName: string | null;
  customerId: string | null;
  customerEmail: string | null;
  description: string | null;
  createdAt: Date;
  capturedAt: Date | null;
  transferId: string | null;
  transferDueAt: Date | null;
  depositAmount: number | null;
  depositDiff: DepositDiff | null;
  failureReason: string | null;
  cardLast4: string | null;
  clientIp: string | null;
  depositDiffStatus: string | null;
  /** Bank transfer only: last manual API re-notification of the merchant (API 再通知). */
  renotifiedAt: Date | null;
  renotifyCount: number;
  /** Konbini (Phase K-1): brand, receipt number, paid time. */
  cvsBrand: string | null;
  cvsReceiptNo: string | null;
  cvsPaidAt: Date | null;
  /** Customer master row (Phase M-1), when linked. */
  customerRef: string | null;
  /** Receipt (Phase K-2) issued for this transaction, if any. */
  receipt: { id: string; receiptNo: string; recipientName: string; amount: number; reissueCount: number; issuedAt: Date; lastIssuedAt: Date; source: string } | null;
  /** capturedAt + merchant.refundWindowDays (null when not completed or no merchant). */
  refundDeadlineAt: Date | null;
  /** Amount reserved by refund requests not decided yet. */
  pendingRefundAmount: number;
  overdue: boolean;
  merchant: { id: string; merchantCode: string; siteName: string; transferIdDigits: number; refundWindowDays: number } | null;
  provider: {
    id: string;
    displayName: string;
    providerKey: string;
    webhookAvailable: boolean;
  };
  events: PaymentEventItem[];
  refunds: RefundItem[];
  /** Internal notes (Phase I-2), oldest first. */
  notes: NoteRow[];
}

export async function loadTransactionDetail(id: string, now: Date = new Date()): Promise<TransactionDetail | null> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      amount: true,
      amountRefunded: true,
      status: true,
      livemode: true,
      externalId: true,
      method: true,
      productName: true,
      customerName: true,
      customerId: true,
      customerEmail: true,
      description: true,
      createdAt: true,
      capturedAt: true,
      transferId: true,
      transferDueAt: true,
      depositAmount: true,
      depositDiff: true,
      failureReason: true,
      cardLast4: true,
      clientIp: true,
      depositDiffStatus: true,
      renotifiedAt: true,
      renotifyCount: true,
      cvsBrand: true,
      cvsReceiptNo: true,
      cvsPaidAt: true,
      customerRef: true,
      receipt: { select: { id: true, receiptNo: true, recipientName: true, amount: true, reissueCount: true, issuedAt: true, lastIssuedAt: true, source: true } },
      merchant: { select: { id: true, merchantCode: true, siteName: true, transferIdDigits: true, refundWindowDays: true } },
      provider: {
        select: { id: true, displayName: true, providerKey: true, category: true, credentials: true },
      },
      notes: { orderBy: { createdAt: "asc" }, select: NOTE_SELECT },
      events: {
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, fromStatus: true, toStatus: true, amount: true, actor: true, createdAt: true },
      },
      refunds: {
        orderBy: { createdAt: "desc" },
        select: { id: true, amount: true, kind: true, reasonCode: true, reason: true, status: true, forced: true, createdAt: true },
      },
    },
  });
  if (!payment) return null;
  const pendingRefundAmount = payment.refunds
    .filter((r) => r.status === "requested" || r.status === "approved" || r.status === "processing")
    .reduce((sum, r) => sum + r.amount, 0);

  // Only a presence check crosses to the client — never the credential store.
  const webhookAvailable = storedFieldKeys(payment.provider.credentials).includes("webhook_secret");

  return {
    id: payment.id,
    orderNumber: payment.orderNumber,
    amount: payment.amount,
    amountRefunded: payment.amountRefunded,
    status: toPaymentStatus(payment.status),
    livemode: payment.livemode,
    externalId: payment.externalId,
    method: toPaymentMethod(payment.method ?? payment.provider.category),
    productName: payment.productName,
    customerName: payment.customerName,
    customerId: payment.customerId,
    customerEmail: payment.customerEmail,
    description: payment.description,
    createdAt: payment.createdAt,
    capturedAt: payment.capturedAt,
    transferId: payment.transferId,
    transferDueAt: payment.transferDueAt,
    depositAmount: payment.depositAmount,
    depositDiff: isDepositDiff(payment.depositDiff) ? payment.depositDiff : null,
    failureReason: payment.failureReason,
    cardLast4: payment.cardLast4,
    clientIp: payment.clientIp,
    depositDiffStatus: payment.depositDiffStatus,
    renotifiedAt: payment.renotifiedAt,
    renotifyCount: payment.renotifyCount,
    cvsBrand: payment.cvsBrand,
    cvsReceiptNo: payment.cvsReceiptNo,
    cvsPaidAt: payment.cvsPaidAt,
    customerRef: payment.customerRef,
    receipt: payment.receipt,
    refundDeadlineAt:
      payment.capturedAt && payment.merchant ? new Date(payment.capturedAt.getTime() + payment.merchant.refundWindowDays * 86_400_000) : null,
    pendingRefundAmount,
    notes: payment.notes,
    overdue: isTransferOverdue(payment, now),
    merchant: payment.merchant,
    provider: {
      id: payment.provider.id,
      displayName: payment.provider.displayName,
      providerKey: payment.provider.providerKey,
      webhookAvailable,
    },
    events: payment.events,
    refunds: payment.refunds,
  };
}
