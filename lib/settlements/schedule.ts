// Payout date and default period helpers, computed in the business time
// zone (Asia/Tokyo) so month boundaries never depend on the server's TZ.

import { BUSINESS_TZ, parseDateInTz } from "@/lib/time";
import type { PayoutTerm, SettlementCycle } from "./types";

export interface YmdParts {
  y: number;
  m: number; // 1-12
  d: number;
}

export function partsInTz(date: Date, tz: string = BUSINESS_TZ): YmdParts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

export function ymd(p: YmdParts): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Midnight (business TZ) of the given calendar day. */
export function dateOf(y: number, m: number, d: number): Date {
  // Roll over out-of-range values (e.g. day 0 = last day of previous month) via UTC math first.
  const norm = new Date(Date.UTC(y, m - 1, d));
  const s = `${norm.getUTCFullYear()}-${String(norm.getUTCMonth() + 1).padStart(2, "0")}-${String(norm.getUTCDate()).padStart(2, "0")}`;
  return parseDateInTz(s)!;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Planned payout date for a period ending on `periodEndInclusive`.
 *   next_month_end       → last day of the following month
 *   next_month_15        → 15th of the following month
 *   month_after_next_15  → 15th of the month after next
 *   next_week            → 7 days after the period end
 */
export function payoutDate(periodEndInclusive: Date, term: PayoutTerm): Date {
  const p = partsInTz(periodEndInclusive);
  switch (term) {
    case "next_month_end":
      return dateOf(p.y, p.m + 2, 0);
    case "next_month_15":
      return dateOf(p.y, p.m + 1, 15);
    case "month_after_next_15":
      return dateOf(p.y, p.m + 2, 15);
    case "next_week":
      return dateOf(p.y, p.m, p.d + 7);
  }
}

/** The most recent closed period for a cycle, as inclusive YYYY-MM-DD strings. */
export function lastClosedPeriod(cycle: SettlementCycle, now: Date = new Date()): { from: string; to: string } {
  const p = partsInTz(now);
  if (cycle === "monthly") {
    const y = p.m === 1 ? p.y - 1 : p.y;
    const m = p.m === 1 ? 12 : p.m - 1;
    return { from: ymd({ y, m, d: 1 }), to: ymd({ y, m, d: daysInMonth(y, m) }) };
  }
  if (cycle === "semimonthly") {
    if (p.d > 15) return { from: ymd({ y: p.y, m: p.m, d: 1 }), to: ymd({ y: p.y, m: p.m, d: 15 }) };
    const y = p.m === 1 ? p.y - 1 : p.y;
    const m = p.m === 1 ? 12 : p.m - 1;
    return { from: ymd({ y, m, d: 16 }), to: ymd({ y, m, d: daysInMonth(y, m) }) };
  }
  // weekly: the previous Monday–Sunday week.
  const today = dateOf(p.y, p.m, p.d);
  const dow = new Date(today.getTime() + 9 * 3_600_000).getUTCDay(); // 0 = Sunday in JST
  const daysSinceMonday = (dow + 6) % 7;
  const start = new Date(today.getTime() - (daysSinceMonday + 7) * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { from: ymd(partsInTz(start)), to: ymd(partsInTz(end)) };
}
