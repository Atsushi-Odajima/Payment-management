// Business-time helpers.
//
// The dashboard serves Japanese EC stores, so "today" is defined in Asia/Tokyo
// regardless of where the server process runs (Vercel functions run in UTC even
// in the hnd1 region). Currency is likewise fixed to JPY — see lib/utils.ts.

export const BUSINESS_TZ = "Asia/Tokyo";

/**
 * Returns the instant at which the calendar day containing `now` starts in the
 * given IANA time zone. Pure function — no dependency on process TZ.
 */
export function startOfDayInTz(now: Date, tz: string = BUSINESS_TZ): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const y = get("year");
  const m = get("month");
  const d = get("day");
  // Midnight of that calendar date if it were UTC, then shift by the zone's
  // offset at that moment so we land on local midnight.
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const offsetMs = tzOffsetMs(new Date(utcMidnight), tz);
  return new Date(utcMidnight - offsetMs);
}

/**
 * Parse a "YYYY-MM-DD" string (from a date input / query) as local midnight
 * in the business time zone. Returns null for anything else.
 */
export function parseDateInTz(value: string | undefined | null, tz: string = BUSINESS_TZ): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const utcMidnight = Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
  const probe = new Date(utcMidnight);
  if (probe.getUTCMonth() !== mo - 1) return null; // e.g. 2026-02-31
  return new Date(utcMidnight - tzOffsetMs(probe, tz));
}

/** Start of the calendar month containing `now` in the business time zone. */
export function startOfMonthInTz(now: Date, tz: string = BUSINESS_TZ): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const utcMidnight = Date.UTC(get("year"), get("month") - 1, 1, 0, 0, 0, 0);
  return new Date(utcMidnight - tzOffsetMs(new Date(utcMidnight), tz));
}

/** Exclusive upper bound for a "to" date: the start of the following day. */
export function nextDayInTz(day: Date): Date {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}

/** Offset of `tz` from UTC at `date`, in milliseconds (JST → +9h). */
export function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
