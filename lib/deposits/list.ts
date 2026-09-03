// Loaders for the unmatched deposits screen (未消込入金) and its CSV export.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { UNMATCHED_DEPOSIT_SELECT, findTransferCandidates } from "./service";
import { UNMATCHED_DEPOSIT_SORT_KEYS, isUnmatchedDepositStatus, type TransferCandidate, type UnmatchedDepositFilters, type UnmatchedDepositRow } from "./types";

export function parseUnmatchedDepositFilters(q: QueryParams | undefined, mode: DataMode): UnmatchedDepositFilters {
  return { status: isUnmatchedDepositStatus(q?.status) ? q!.status! : "", mode };
}

export function parseUnmatchedDepositSort(q: QueryParams | undefined): SortState {
  return parseSort(q, UNMATCHED_DEPOSIT_SORT_KEYS, { key: "receivedAt", dir: "desc" });
}

type Raw = Omit<UnmatchedDepositRow, "status" | "source"> & { status: string; source: string };
export const toUnmatchedDepositRow = (r: Raw): UnmatchedDepositRow => ({ ...r, status: isUnmatchedDepositStatus(r.status) ? r.status : "unmatched", source: r.source === "bank" ? "bank" : "manual" });

function whereFor(f: UnmatchedDepositFilters) {
  return { livemode: f.mode === "live", ...(f.status ? { status: f.status } : {}) };
}

export async function loadUnmatchedDeposits(opts: { filters: UnmatchedDepositFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const [rows, total, openCount] = await Promise.all([
    prisma.unmatchedDeposit.findMany({
      where,
      // Open deposits first, then the requested order.
      orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: UNMATCHED_DEPOSIT_SELECT,
    }),
    prisma.unmatchedDeposit.count({ where }),
    prisma.unmatchedDeposit.count({ where: { livemode: opts.filters.mode === "live", status: "unmatched" } }),
  ]);
  const mapped = rows.map(toUnmatchedDepositRow);
  if (opts.sort.key === "receivedAt" && opts.sort.dir === "desc") mapped.sort((a, b) => Number(b.status === "unmatched") - Number(a.status === "unmatched"));
  return { rows: mapped, total, openCount };
}

export async function loadUnmatchedDepositsForExport(filters: UnmatchedDepositFilters, sort: SortState, max: number): Promise<UnmatchedDepositRow[]> {
  const rows = await prisma.unmatchedDeposit.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: UNMATCHED_DEPOSIT_SELECT });
  return rows.map(toUnmatchedDepositRow);
}

export async function loadUnmatchedDeposit(id: string): Promise<{ deposit: UnmatchedDepositRow; candidates: TransferCandidate[] } | null> {
  const r = await prisma.unmatchedDeposit.findUnique({ where: { id }, select: UNMATCHED_DEPOSIT_SELECT });
  if (!r) return null;
  const deposit = toUnmatchedDepositRow(r);
  const candidates = deposit.status === "unmatched" ? await findTransferCandidates(prisma, deposit) : [];
  return { deposit, candidates };
}
