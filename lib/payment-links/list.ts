// Loaders for the payment link screens.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { PAYMENT_LINK_SELECT, linkUnavailableReason } from "./service";
import { isPaymentLinkStatus, type LinkUnavailableReason, type PaymentLinkStatus } from "./types";

export interface PaymentLinkRow {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string };
  token: string;
  productName: string;
  amount: number;
  description: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  status: PaymentLinkStatus;
  /** null when the link can be used right now. */
  unavailable: LinkUnavailableReason | null;
  livemode: boolean;
  createdAt: Date;
}

export interface LinkPaymentRow {
  id: string;
  orderNumber: string;
  customerName: string | null;
  method: string | null;
  status: string;
  amount: number;
  createdAt: Date;
}

export interface PaymentLinkFilters {
  status: PaymentLinkStatus | "";
  merchant: string;
  mode: DataMode;
}

export const PAYMENT_LINK_SORT_KEYS = ["createdAt", "amount", "usedCount", "status"] as const;

export function parsePaymentLinkFilters(q: QueryParams | undefined, mode: DataMode): PaymentLinkFilters {
  return { status: isPaymentLinkStatus(q?.status) ? q!.status! : "", merchant: (q?.merchant ?? "").trim().slice(0, 64), mode };
}

export function parsePaymentLinkSort(q: QueryParams | undefined): SortState {
  return parseSort(q, PAYMENT_LINK_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

type Raw = Omit<PaymentLinkRow, "status" | "unavailable" | "merchant"> & { status: string; merchant: PaymentLinkRow["merchant"] & { enabledMethods: string } };
export function toPaymentLinkRow(r: Raw, now: Date = new Date()): PaymentLinkRow {
  const { enabledMethods: _e, ...merchant } = r.merchant;
  void _e;
  return { ...r, merchant, status: isPaymentLinkStatus(r.status) ? r.status : "disabled", unavailable: linkUnavailableReason(r, now) };
}

export async function loadPaymentLinks(opts: { filters: PaymentLinkFilters; sort: SortState; page: number; pageSize: number }) {
  const f = opts.filters;
  const where = { livemode: f.mode === "live", ...(f.status ? { status: f.status } : {}), ...(f.merchant ? { merchantId: f.merchant } : {}) };
  const [rows, total, merchants] = await Promise.all([
    prisma.paymentLink.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: PAYMENT_LINK_SELECT }),
    prisma.paymentLink.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
  ]);
  return { rows: rows.map((r) => toPaymentLinkRow(r)), total, merchants };
}

export async function loadPaymentLink(id: string): Promise<{ link: PaymentLinkRow; payments: LinkPaymentRow[] } | null> {
  const r = await prisma.paymentLink.findUnique({ where: { id }, select: PAYMENT_LINK_SELECT });
  if (!r) return null;
  const payments = await prisma.payment.findMany({ where: { paymentLinkId: id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, orderNumber: true, customerName: true, method: true, status: true, amount: true, createdAt: true } });
  return { link: toPaymentLinkRow(r), payments };
}

/** Public page data (never the merchant's internals beyond its name). */
export async function loadPublicLink(token: string) {
  const r = await prisma.paymentLink.findUnique({ where: { token }, select: PAYMENT_LINK_SELECT });
  return r ? toPaymentLinkRow(r) : null;
}
