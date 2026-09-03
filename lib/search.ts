// Global search (横断検索). One query fans out to the entities that carry
// operator-visible identifiers; results are grouped per category. Card
// last-4 search joins in Phase F once the card hash column exists.

import { prisma } from "@/lib/db";
import { toPaymentMethod, type PaymentMethod } from "@/lib/payments/methods";
import { toPaymentStatus, type PaymentStatus } from "@/lib/payments/transitions";

export interface SearchPayment {
  id: string;
  orderNumber: string;
  transferId: string | null;
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

export interface SearchResult {
  q: string;
  payments: SearchPayment[];
  merchants: SearchMerchant[];
  agents: SearchAgent[];
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
  const empty: SearchResult = { q, payments: [], merchants: [], agents: [], admins: [], total: 0 };
  if (q.length < SEARCH_MIN_LENGTH) return empty;

  // SQLite `contains` is case-sensitive by default; Postgres gets `mode: insensitive`.
  const contains = { contains: q };
  const [payments, merchants, agents, admins] = await Promise.all([
    prisma.payment.findMany({
      where: {
        OR: [
          { id: q },
          { orderNumber: contains },
          { transferId: q },
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
      customerName: p.customerName,
      customerEmail: p.customerEmail,
      amount: p.amount,
      status: toPaymentStatus(p.status),
      method: toPaymentMethod(p.method ?? p.provider.category),
      merchantName: p.merchant?.siteName ?? null,
      createdAt: p.createdAt,
    })),
    merchants,
    agents,
    admins,
    total: 0,
  };
  result.total = result.payments.length + result.merchants.length + result.agents.length + result.admins.length;
  return result;
}
