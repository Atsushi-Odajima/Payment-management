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
