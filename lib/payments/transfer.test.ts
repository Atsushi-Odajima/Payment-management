import { describe, expect, it } from "vitest";
import {
  TRANSFER_DUE_DAYS,
  generateTransferId,
  isTransferIdFormat,
  isTransferOverdue,
  reconcileDeposit,
  transferDueDate,
} from "./transfer";

describe("bank transfer helpers", () => {
  it("generates numeric ids of the requested length that never start with 0", () => {
    for (const digits of [7, 8] as const) {
      for (let i = 0; i < 50; i++) {
        const id = generateTransferId(digits);
        expect(id).toHaveLength(digits);
        expect(isTransferIdFormat(id)).toBe(true);
      }
    }
    expect(generateTransferId(7, () => 0)).toBe("1000000");
    expect(generateTransferId(8, () => 0.999)).toBe("99999999");
    expect(isTransferIdFormat("0123456")).toBe(false);
    expect(isTransferIdFormat("123456")).toBe(false);
  });

  it("sets the deadline TRANSFER_DUE_DAYS after checkout", () => {
    const from = new Date("2026-09-01T03:00:00Z");
    expect(transferDueDate(from).getTime() - from.getTime()).toBe(TRANSFER_DUE_DAYS * 86_400_000);
  });

  it("flags awaiting transfers whose deadline has passed", () => {
    const now = new Date("2026-09-02T00:00:00Z");
    expect(isTransferOverdue({ status: "awaiting_transfer", transferDueAt: new Date("2026-09-01T00:00:00Z") }, now)).toBe(true);
    expect(isTransferOverdue({ status: "awaiting_transfer", transferDueAt: new Date("2026-09-03T00:00:00Z") }, now)).toBe(false);
    expect(isTransferOverdue({ status: "captured", transferDueAt: new Date("2026-09-01T00:00:00Z") }, now)).toBe(false);
    expect(isTransferOverdue({ status: "awaiting_transfer", transferDueAt: null }, now)).toBe(false);
    // Konbini slips (Phase K) reuse the deadline column while pending.
    expect(isTransferOverdue({ status: "pending", transferDueAt: new Date("2026-09-01T00:00:00Z") }, now)).toBe(true);
  });

  it("keeps a short konbini payment pending instead of awaiting_transfer", () => {
    expect(reconcileDeposit(10000, 0, 4000, "pending")).toEqual({ total: 4000, status: "pending", diff: "short" });
    expect(reconcileDeposit(10000, 0, 10000, "pending")).toEqual({ total: 10000, status: "captured", diff: null });
  });

  it("reconciles deposits: short stays awaiting, exact completes, excess completes with a flag", () => {
    expect(reconcileDeposit(10000, 0, 4000)).toEqual({ total: 4000, status: "awaiting_transfer", diff: "short" });
    expect(reconcileDeposit(10000, 4000, 6000)).toEqual({ total: 10000, status: "captured", diff: null });
    expect(reconcileDeposit(10000, 0, 12000)).toEqual({ total: 12000, status: "captured", diff: "excess" });
    expect(reconcileDeposit(10000, 4000, 7000)).toEqual({ total: 11000, status: "captured", diff: "excess" });
  });
});
