// Loaders for the customer screens (Phase M-1): operator list / detail
// (masked unless the caller asks for full data) and the merchant portal's
// own-customer views (full).

import { prisma } from "@/lib/db";
import { maskEmail, maskName, maskPhone, type PiiMode } from "@/lib/pii/mask";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";

export interface CustomerRow {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string };
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  anonymizedAt: Date | null;
  paymentCount: number;
  tokenCount: number;
  lastPaymentAt: Date | null;
  createdAt: Date;
}

export interface CustomerTokenRow {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface CustomerPaymentRow {
  id: string;
  orderNumber: string;
  amount: number;
  status: string;
  method: string | null;
  livemode: boolean;
  createdAt: Date;
}

export interface CustomerDetail extends CustomerRow {
  anonymizeReason: string | null;
  tokens: CustomerTokenRow[];
  payments: CustomerPaymentRow[];
}

export interface CustomerFilters {
  merchant: string;
  q: string;
  anonymized: "" | "yes" | "no";
}

export const CUSTOMER_SORT_KEYS = ["createdAt", "externalId", "name"] as const;

export function parseCustomerFilters(q: QueryParams | undefined): CustomerFilters {
  const a = q?.anonymized;
  return { merchant: (q?.merchant ?? "").trim().slice(0, 64), q: (q?.q ?? "").trim().slice(0, 100), anonymized: a === "yes" || a === "no" ? a : "" };
}

export function parseCustomerSort(q: QueryParams | undefined): SortState {
  return parseSort(q, CUSTOMER_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

const ROW_SELECT = {
  id: true,
  externalId: true,
  name: true,
  email: true,
  phone: true,
  anonymizedAt: true,
  createdAt: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
  _count: { select: { payments: true, tokens: true } },
  payments: { orderBy: { createdAt: "desc" as const }, take: 1, select: { createdAt: true } },
} as const;

type Raw = { id: string; externalId: string; name: string | null; email: string | null; phone: string | null; anonymizedAt: Date | null; createdAt: Date; merchant: { id: string; merchantCode: string; siteName: string }; _count: { payments: number; tokens: number }; payments: { createdAt: Date }[] };

function toRow(r: Raw, mode: PiiMode): CustomerRow {
  return {
    id: r.id,
    merchant: r.merchant,
    externalId: r.externalId,
    name: mode === "full" ? r.name : maskName(r.name),
    email: mode === "full" ? r.email : maskEmail(r.email),
    phone: mode === "full" ? r.phone : maskPhone(r.phone),
    anonymizedAt: r.anonymizedAt,
    paymentCount: r._count.payments,
    tokenCount: r._count.tokens,
    lastPaymentAt: r.payments[0]?.createdAt ?? null,
    createdAt: r.createdAt,
  };
}

function whereFor(f: CustomerFilters, merchantId?: string) {
  return {
    ...(merchantId ? { merchantId } : f.merchant ? { merchantId: f.merchant } : {}),
    ...(f.anonymized === "yes" ? { anonymizedAt: { not: null } } : f.anonymized === "no" ? { anonymizedAt: null } : {}),
    ...(f.q ? { OR: [{ externalId: { contains: f.q } }, { name: { contains: f.q } }, { email: { contains: f.q } }] } : {}),
  };
}

export async function loadCustomers(opts: { filters: CustomerFilters; sort: SortState; page: number; pageSize: number; mode: PiiMode; merchantId?: string }) {
  const where = whereFor(opts.filters, opts.merchantId);
  const [rows, total, merchants] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { id: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: ROW_SELECT }),
    prisma.customer.count({ where }),
    opts.merchantId ? Promise.resolve([]) : prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
  ]);
  return { rows: rows.map((r) => toRow(r, opts.mode)), total, merchants };
}

export async function loadCustomersForExport(filters: CustomerFilters, sort: SortState, max: number, mode: PiiMode): Promise<CustomerRow[]> {
  const rows = await prisma.customer.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: ROW_SELECT });
  return rows.map((r) => toRow(r, mode));
}

export async function loadCustomer(id: string, mode: PiiMode, merchantId?: string): Promise<CustomerDetail | null> {
  const r = await prisma.customer.findFirst({
    where: { id, ...(merchantId ? { merchantId } : {}) },
    select: {
      ...ROW_SELECT,
      anonymizeReason: true,
      tokens: { orderBy: { createdAt: "desc" }, select: { id: true, brand: true, last4: true, expiry: true, createdAt: true, lastUsedAt: true } },
    },
  });
  if (!r) return null;
  const payments = await prisma.payment.findMany({ where: { customerRef: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, orderNumber: true, amount: true, status: true, method: true, livemode: true, createdAt: true } });
  return { ...toRow(r, mode), anonymizeReason: r.anonymizeReason, tokens: r.tokens, payments };
}

export interface AnonymizeBatchRow {
  id: string;
  kind: string;
  customers: number;
  payments: number;
  tokens: number;
  auditLogs: number;
  note: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export async function loadAnonymizeBatches(take = 50): Promise<AnonymizeBatchRow[]> {
  return prisma.anonymizeBatch.findMany({ orderBy: { startedAt: "desc" }, take, select: { id: true, kind: true, customers: true, payments: true, tokens: true, auditLogs: true, note: true, startedAt: true, finishedAt: true } });
}
