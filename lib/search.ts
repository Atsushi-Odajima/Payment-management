// Global search (横断検索). One query fans out to the entities that carry
// operator-visible identifiers; results are grouped per category. Card
// last-4 search joins in Phase F once the card hash column exists.

import { prisma } from "@/lib/db";
import { toPaymentMethod, type PaymentMethod } from "@/lib/payments/methods";
import { maskEmail, maskName } from "@/lib/pii/mask";
import { toPaymentStatus, type PaymentStatus } from "@/lib/payments/transitions";

export interface SearchPayment {
  id: string;
  orderNumber: string;
  transferId: string | null;
  cardLast4: string | null;
  customerName: string | null;
  customerEmail: string | null;
  amount: number;
  status: PaymentStatus;
  method: PaymentMethod;
  merchantName: string | null;
  createdAt: Date;
}
export interface SearchMerchant {
  id: string;
  merchantCode: string;
  siteName: string;
  companyName: string;
  email: string;
}
export interface SearchAgent {
  id: string;
  agentCode: string;
  name: string;
  companyName: string;
  email: string;
}
export interface SearchAdmin {
  id: string;
  loginId: string;
  name: string;
  email: string;
  role: string;
}

export interface SearchCustomer {
  id: string;
  externalId: string;
  name: string | null;
  email: string | null;
  merchantName: string;
  anonymized: boolean;
}

export interface SearchSettlement {
  id: string;
  invoiceNo: string;
  merchantName: string;
  merchantCode: string;
  status: string;
  netAmount: number;
  periodFrom: Date;
}

export interface SearchResult {
  q: string;
  payments: SearchPayment[];
  customers: SearchCustomer[];
  merchants: SearchMerchant[];
  agents: SearchAgent[];
  settlements: SearchSettlement[];
  admins: SearchAdmin[];
  total: number;
}

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

export function normalizeQuery(raw: string | undefined | null): string {
  return (raw ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
}

export async function searchAll(raw: string, opts: { limit?: number; includeAdmins?: boolean } = {}): Promise<SearchResult> {
  const q = normalizeQuery(raw);
  const limit = opts.limit ?? 5;
  const empty: SearchResult = { q, payments: [], customers: [], merchants: [], agents: [], settlements: [], admins: [], total: 0 };
  if (q.length < SEARCH_MIN_LENGTH) return empty;

  // SQLite `contains` is case-sensitive by default; Postgres gets `mode: insensitive`.
  const contains = { contains: q };
  const [payments, customers, merchants, agents, settlements, admins] = await Promise.all([
    prisma.payment.findMany({
      where: {
        OR: [
          { id: q },
          { orderNumber: contains },
          { transferId: q },
          { cardLast4: q },
          { externalId: q },
          { customerEmail: contains },
          { customerId: q },
          { customerName: contains },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        transferId: true,
        cardLast4: true,
        customerName: true,
        customerEmail: true,
        amount: true,
        status: true,
        method: true,
        createdAt: true,
        provider: { select: { category: true } },
        merchant: { select: { siteName: true } },
      },
    }),
    // Customer master (Phase M-1): by the merchant's customer id, name or e-mail.
    prisma.customer.findMany({
      where: { OR: [{ externalId: contains }, { name: contains }, { email: contains }] },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, externalId: true, name: true, email: true, anonymizedAt: true, merchant: { select: { siteName: true } } },
    }),
    prisma.merchant.findMany({
      where: { OR: [{ merchantCode: contains }, { siteName: contains }, { siteNameKana: contains }, { companyName: contains }, { email: contains }] },
      orderBy: { merchantCode: "asc" },
      take: limit,
      select: { id: true, merchantCode: true, siteName: true, companyName: true, email: true },
    }),
    prisma.agent.findMany({
      where: { OR: [{ agentCode: contains }, { name: contains }, { nameKana: contains }, { companyName: contains }, { email: contains }] },
      orderBy: { agentCode: "asc" },
      take: limit,
      select: { id: true, agentCode: true, name: true, companyName: true, email: true },
    }),
    // Settlement batches by invoice number (Phase P1-5).
    prisma.settlementBatch.findMany({
      where: { invoiceNo: contains },
      orderBy: { periodFrom: "desc" },
      take: limit,
      select: { id: true, invoiceNo: true, status: true, netAmount: true, periodFrom: true, merchant: { select: { merchantCode: true, siteName: true } } },
    }),
    opts.includeAdmins
      ? prisma.adminUser.findMany({
          where: { OR: [{ loginId: contains }, { name: contains }, { email: contains }] },
          orderBy: { loginId: "asc" },
          take: limit,
          select: { id: true, loginId: true, name: true, email: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  const result: SearchResult = {
    q,
    payments: payments.map((p) => ({
      id: p.id,
      orderNumber: p.orderNumber,
      transferId: p.transferId,
      cardLast4: p.cardLast4,
      // Search results are operator screens: personal data stays masked (Phase M-2).
      customerName: maskName(p.customerName),
      customerEmail: maskEmail(p.customerEmail),
      amount: p.amount,
      status: toPaymentStatus(p.status),
      method: toPaymentMethod(p.method ?? p.provider.category),
      merchantName: p.merchant?.siteName ?? null,
      createdAt: p.createdAt,
    })),
    customers: customers.map((c) => ({ id: c.id, externalId: c.externalId, name: maskName(c.name), email: maskEmail(c.email), merchantName: c.merchant.siteName, anonymized: c.anonymizedAt !== null })),
    merchants,
    agents,
    settlements: settlements.map((s) => ({ id: s.id, invoiceNo: s.invoiceNo ?? "", merchantName: s.merchant.siteName, merchantCode: s.merchant.merchantCode, status: s.status, netAmount: s.netAmount, periodFrom: s.periodFrom })),
    admins,
    total: 0,
  };
  result.total = result.payments.length + result.customers.length + result.merchants.length + result.agents.length + result.settlements.length + result.admins.length;
  return result;
}
