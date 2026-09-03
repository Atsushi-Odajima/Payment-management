// Agent referral fees (Phase H-3): agent.feeRate % of the net payout of the
// merchant's settlement batches confirmed in a month (confirmed / scheduled /
// paid; held and collecting batches are excluded until they settle).
// Computed on the fly — no table, the batches are the ledger.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import type { QueryParams } from "@/lib/query";
import { dateOf, partsInTz } from "@/lib/settlements/schedule";

export interface AgentFeeFilters {
  /** YYYY-MM (business TZ). */
  month: string;
  agent: string;
  mode: DataMode;
}

export interface AgentFeeLine {
  batchId: string;
  merchantId: string;
  merchantCode: string;
  siteName: string;
  periodFrom: Date;
  periodTo: Date;
  status: string;
  netAmount: number;
  feeRate: number;
  fee: number;
}

export interface AgentFeeRow {
  agentId: string;
  agentCode: string;
  name: string;
  feeRate: number;
  merchantCount: number;
  batchCount: number;
  netAmount: number;
  fee: number;
  lines: AgentFeeLine[];
}

export const COUNTED_BATCH_STATUSES = ["confirmed", "scheduled", "paid"] as const;

export function currentMonth(now: Date = new Date()): string {
  const p = partsInTz(now);
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

export function parseAgentFeeFilters(q: QueryParams | undefined, mode: DataMode, now: Date = new Date()): AgentFeeFilters {
  const month = q?.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) ? q.month : currentMonth(now);
  return { month, agent: (q?.agent ?? "").trim().slice(0, 64), mode };
}

/** Fee for one batch, rounded down to the yen. */
export function agentFee(netAmount: number, feeRate: number): number {
  return netAmount > 0 ? Math.floor((netAmount * feeRate) / 100) : 0;
}

export async function buildAgentFees(filters: AgentFeeFilters): Promise<{ rows: AgentFeeRow[]; agents: { id: string; agentCode: string; name: string }[] }> {
  const [y, m] = filters.month.split("-").map(Number);
  const from = dateOf(y, m, 1);
  const to = dateOf(y, m + 1, 1);
  const [batches, agents] = await Promise.all([
    prisma.settlementBatch.findMany({
      where: { livemode: filters.mode === "live", status: { in: [...COUNTED_BATCH_STATUSES] }, periodFrom: { gte: from, lt: to }, merchant: { agentId: filters.agent ? filters.agent : { not: null } } },
      select: { id: true, merchantId: true, periodFrom: true, periodTo: true, status: true, netAmount: true, merchant: { select: { merchantCode: true, siteName: true, agent: { select: { id: true, agentCode: true, name: true, feeRate: true } } } } },
      orderBy: [{ merchantId: "asc" }, { periodFrom: "asc" }],
    }),
    prisma.agent.findMany({ orderBy: { agentCode: "asc" }, select: { id: true, agentCode: true, name: true } }),
  ]);
  const byAgent = new Map<string, AgentFeeRow>();
  for (const b of batches) {
    const a = b.merchant.agent;
    if (!a) continue;
    const row = byAgent.get(a.id) ?? { agentId: a.id, agentCode: a.agentCode, name: a.name, feeRate: a.feeRate, merchantCount: 0, batchCount: 0, netAmount: 0, fee: 0, lines: [] };
    const fee = agentFee(b.netAmount, a.feeRate);
    row.lines.push({ batchId: b.id, merchantId: b.merchantId, merchantCode: b.merchant.merchantCode, siteName: b.merchant.siteName, periodFrom: b.periodFrom, periodTo: b.periodTo, status: b.status, netAmount: b.netAmount, feeRate: a.feeRate, fee });
    row.batchCount++;
    row.netAmount += b.netAmount;
    row.fee += fee;
    byAgent.set(a.id, row);
  }
  const rows = [...byAgent.values()].map((r) => ({ ...r, merchantCount: new Set(r.lines.map((l) => l.merchantId)).size })).sort((a, b) => b.fee - a.fee || a.agentCode.localeCompare(b.agentCode));
  return { rows, agents };
}
