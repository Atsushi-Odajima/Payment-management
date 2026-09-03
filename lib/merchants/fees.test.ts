import { describe, expect, it } from "vitest";
import { PLAN_DEFAULT_RATES, calculateFee, currentScheduleIndex, feeScheduleInputSchema, parseFeeRates, ratesForPlan, toFeeScheduleViews } from "./fees";

const d = (s: string) => new Date(s);

describe("fee schedules", () => {
  it("picks the latest schedule whose effective date has passed", () => {
    const rows = [{ effectiveFrom: d("2026-10-01") }, { effectiveFrom: d("2026-09-01") }, { effectiveFrom: d("2026-08-01") }];
    expect(currentScheduleIndex(rows, d("2026-09-15"))).toBe(1);
    expect(currentScheduleIndex(rows, d("2026-07-01"))).toBe(-1);
    expect(currentScheduleIndex(rows, d("2026-12-01"))).toBe(0);
  });

  it("flags current and upcoming schedules in the view", () => {
    const rows = [
      { id: "b", plan: "premium", rates: JSON.stringify(PLAN_DEFAULT_RATES.premium), effectiveFrom: d("2026-10-01"), note: null, createdAt: d("2026-09-01") },
      { id: "a", plan: "standard", rates: JSON.stringify(PLAN_DEFAULT_RATES.standard), effectiveFrom: d("2026-08-01"), note: "start", createdAt: d("2026-08-01") },
    ];
    const views = toFeeScheduleViews(rows, d("2026-09-15"));
    expect(views.map((v) => [v.id, v.current, v.upcoming])).toEqual([
      ["b", false, true],
      ["a", true, false],
    ]);
    expect(views[0].rates.credit.ratePercent).toBe(3.2);
  });

  it("falls back to the standard rates for malformed JSON", () => {
    expect(parseFeeRates("not json")).toEqual(PLAN_DEFAULT_RATES.standard);
    expect(parseFeeRates(JSON.stringify({ credit: { ratePercent: 1 } }))).toEqual(PLAN_DEFAULT_RATES.standard);
  });

  it("uses plan defaults except for custom", () => {
    expect(ratesForPlan("premium")).toBe(PLAN_DEFAULT_RATES.premium);
    const custom = { ...PLAN_DEFAULT_RATES.standard, credit: { ratePercent: 2.5, fixedFee: 10 } };
    expect(ratesForPlan("custom", custom)).toBe(custom);
  });

  it("calculates the fee rounded down to the yen plus the fixed part", () => {
    expect(calculateFee(PLAN_DEFAULT_RATES.standard, "credit", 4980)).toBe(179); // 3.6% of 4980 = 179.28
    expect(calculateFee(PLAN_DEFAULT_RATES.standard, "bank", 12000)).toBe(290); // 2% + ¥50
  });

  it("validates the schedule input", () => {
    expect(feeScheduleInputSchema.safeParse({ plan: "standard" }).success).toBe(true);
    expect(feeScheduleInputSchema.safeParse({ plan: "gold" }).success).toBe(false);
    expect(feeScheduleInputSchema.safeParse({ plan: "standard", effectiveFrom: "2026-13-40" }).success).toBe(false);
    const bad = feeScheduleInputSchema.safeParse({ plan: "custom", rates: { ...PLAN_DEFAULT_RATES.standard, credit: { ratePercent: 3.123, fixedFee: 0 } } });
    expect(bad.success).toBe(false);
  });
});
