import { describe, expect, it } from "vitest";
import { evaluateLimit, limitFailureReason, limitsInputSchema } from "./limits";

describe("transaction limits", () => {
  const usage = { todayAmount: 250_000, monthAmount: 2_900_000 };

  it("passes when no limit is configured", () => {
    expect(evaluateLimit(null, usage, 1_000_000)).toEqual({ ok: true });
    expect(evaluateLimit({ perTransaction: null, daily: null, monthly: null }, usage, 1_000_000)).toEqual({ ok: true });
  });

  it("checks per transaction, then daily, then monthly", () => {
    const limit = { perTransaction: 100_000, daily: 300_000, monthly: 3_000_000 };
    expect(evaluateLimit(limit, usage, 100_001)).toMatchObject({ ok: false, reason: "per_transaction", limit: 100_000 });
    expect(evaluateLimit(limit, usage, 60_000)).toMatchObject({ ok: false, reason: "daily", current: 250_000 });
    expect(evaluateLimit(limit, { todayAmount: 0, monthAmount: 2_950_000 }, 60_000)).toMatchObject({ ok: false, reason: "monthly" });
    expect(evaluateLimit(limit, { todayAmount: 0, monthAmount: 0 }, 100_000)).toEqual({ ok: true });
  });

  it("formats the failure reason stored on the transaction", () => {
    expect(limitFailureReason("daily")).toBe("limit_exceeded:daily");
  });

  it("validates the limit input (positive integers, one row per method)", () => {
    expect(limitsInputSchema.safeParse([{ method: "credit", perTransaction: 1000 }]).success).toBe(true);
    expect(limitsInputSchema.safeParse([{ method: "credit", daily: 0 }]).success).toBe(false);
    expect(limitsInputSchema.safeParse([{ method: "credit", daily: 10.5 }]).success).toBe(false);
    expect(limitsInputSchema.safeParse([{ method: "credit" }, { method: "credit" }]).success).toBe(false);
    expect(limitsInputSchema.safeParse([{ method: "other" }]).success).toBe(false);
  });
});
