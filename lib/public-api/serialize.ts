// Public API v1 resource shapes (Phase L-1). The same serializers feed the
// OpenAPI examples, so what the docs show is what the API returns.

import { toPaymentMethod } from "@/lib/payments/methods";

export const PUBLIC_TRANSACTION_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  amount: true,
  amountRefunded: true,
  currency: true,
  method: true,
  livemode: true,
  productName: true,
  customerName: true,
  customerId: true,
  customerEmail: true,
  description: true,
  failureReason: true,
  transferId: true,
  transferDueAt: true,
  depositAmount: true,
  cvsBrand: true,
  cvsReceiptNo: true,
  cvsPaidAt: true,
  cardLast4: true,
  createdAt: true,
  capturedAt: true,
  cancelledAt: true,
  refundedAt: true,
  provider: { select: { category: true } },
} as const;

export interface PublicTransaction {
  object: "transaction";
  id: string;
  orderNumber: string;
  status: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  method: string;
  mode: "test" | "live";
  productName: string | null;
  customer: { id: string | null; name: string | null; email: string | null };
  description: string | null;
  failureReason: string | null;
  bankTransfer: { transferId: string; dueAt: string | null; depositAmount: number } | null;
  konbini: { brand: string | null; receiptNo: string; dueAt: string | null; paidAt: string | null } | null;
  card: { last4: string } | null;
  createdAt: string;
  capturedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
}

type Row = {
  id: string;
  orderNumber: string;
  status: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  method: string | null;
  livemode: boolean;
  productName: string | null;
  customerName: string | null;
  customerId: string | null;
  customerEmail: string | null;
  description: string | null;
  failureReason: string | null;
  transferId: string | null;
  transferDueAt: Date | null;
  depositAmount: number | null;
  cvsBrand: string | null;
  cvsReceiptNo: string | null;
  cvsPaidAt: Date | null;
  cardLast4: string | null;
  createdAt: Date;
  capturedAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
  provider: { category: string };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function serializeTransaction(p: Row): PublicTransaction {
  return {
    object: "transaction",
    id: p.id,
    orderNumber: p.orderNumber,
    status: p.status,
    amount: p.amount,
    amountRefunded: p.amountRefunded,
    currency: p.currency,
    method: toPaymentMethod(p.method ?? p.provider.category),
    mode: p.livemode ? "live" : "test",
    productName: p.productName,
    customer: { id: p.customerId, name: p.customerName, email: p.customerEmail },
    description: p.description,
    failureReason: p.failureReason,
    bankTransfer: p.transferId ? { transferId: p.transferId, dueAt: iso(p.transferDueAt), depositAmount: p.depositAmount ?? 0 } : null,
    konbini: p.cvsReceiptNo ? { brand: p.cvsBrand, receiptNo: p.cvsReceiptNo, dueAt: iso(p.transferDueAt), paidAt: iso(p.cvsPaidAt) } : null,
    card: p.cardLast4 ? { last4: p.cardLast4 } : null,
    createdAt: p.createdAt.toISOString(),
    capturedAt: iso(p.capturedAt),
    cancelledAt: iso(p.cancelledAt),
    refundedAt: iso(p.refundedAt),
  };
}

export const PUBLIC_REFUND_SELECT = { id: true, paymentId: true, amount: true, kind: true, reasonCode: true, reason: true, status: true, createdAt: true, completedAt: true } as const;

export interface PublicRefund {
  object: "refund";
  id: string;
  transactionId: string;
  amount: number;
  kind: string;
  reasonCode: string;
  reason: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export function serializeRefund(r: { id: string; paymentId: string; amount: number; kind: string; reasonCode: string; reason: string | null; status: string; createdAt: Date; completedAt: Date | null }): PublicRefund {
  return { object: "refund", id: r.id, transactionId: r.paymentId, amount: r.amount, kind: r.kind, reasonCode: r.reasonCode, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) };
}

export interface PublicPaymentLink {
  object: "payment_link";
  id: string;
  url: string;
  token: string;
  productName: string;
  amount: number;
  description: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  status: string;
  mode: "test" | "live";
  createdAt: string;
}

export function serializePaymentLink(l: { id: string; token: string; productName: string; amount: number; description: string | null; expiresAt: Date | null; maxUses: number | null; usedCount: number; status: string; livemode: boolean; createdAt: Date }, baseUrl: string): PublicPaymentLink {
  return {
    object: "payment_link",
    id: l.id,
    url: `${baseUrl}/pay/${l.token}`,
    token: l.token,
    productName: l.productName,
    amount: l.amount,
    description: l.description,
    expiresAt: iso(l.expiresAt),
    maxUses: l.maxUses,
    usedCount: l.usedCount,
    status: l.status,
    mode: l.livemode ? "live" : "test",
    createdAt: l.createdAt.toISOString(),
  };
}

/** Examples used by the OpenAPI document and the docs page. */
export const EXAMPLE_TRANSACTION: PublicTransaction = {
  object: "transaction",
  id: "clx1a2b3c4d5e6f7g8h9i0j1k",
  orderNumber: "ORD-2026-00042",
  status: "captured",
  amount: 4980,
  amountRefunded: 0,
  currency: "JPY",
  method: "credit",
  mode: "test",
  productName: "Spring jacket",
  customer: { id: "u_10021", name: "Taro Yamada", email: "taro@example.com" },
  description: null,
  failureReason: null,
  bankTransfer: null,
  konbini: null,
  card: { last4: "4242" },
  createdAt: "2026-09-01T03:00:00.000Z",
  capturedAt: "2026-09-01T03:00:00.000Z",
  cancelledAt: null,
  refundedAt: null,
};

export const EXAMPLE_REFUND: PublicRefund = { object: "refund", id: "clx2refund0000000000000001", transactionId: EXAMPLE_TRANSACTION.id, amount: 1000, kind: "partial", reasonCode: "customer", reason: null, status: "requested", createdAt: "2026-09-02T01:00:00.000Z", completedAt: null };

export const EXAMPLE_PAYMENT_LINK: PublicPaymentLink = { object: "payment_link", id: "clx3link000000000000000001", url: "https://wire-pay.example.com/pay/kotoridemolinktoken00001", token: "kotoridemolinktoken00001", productName: "Limited tote bag", amount: 3200, description: null, expiresAt: null, maxUses: 100, usedCount: 0, status: "active", mode: "test", createdAt: "2026-09-01T03:00:00.000Z" };
