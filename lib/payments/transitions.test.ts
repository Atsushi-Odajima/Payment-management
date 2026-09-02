import { describe, expect, it } from "vitest";
import {
  PAYMENT_ACTIONS,
  PAYMENT_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  initialStatus,
  isPaymentStatus,
  statusAfterRefund,
  toPaymentStatus,
  type PaymentAction,
  type PaymentStatus,
} from "./transitions";

// The full legal matrix, written out so a change to TRANSITIONS is a
// deliberate, reviewed change.
const LEGAL: Record<PaymentStatus, PaymentAction[]> = {
  pending: ["capture", "cancel", "fail"],
  authorized: ["capture", "cancel", "fail"],
  captured: ["refund"],
  partially_refunded: ["refund"],
  refunded: [],
  cancelled: [],
  failed: [],
};

describe("payment state machine", () => {
  describe.each(PAYMENT_STATUSES)("from %s", (status) => {
    it.each(PAYMENT_ACTIONS)("%s", (action) => {
      expect(canTransition(status, action)).toBe(LEGAL[status].includes(action));
    });
  });

  it("marks refunded / cancelled / failed as terminal", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(["cancelled", "failed", "refunded"]);
  });

  it("resolves the status after a refund", () => {
    expect(statusAfterRefund(1000, 0, 400)).toBe("partially_refunded");
    expect(statusAfterRefund(1000, 400, 600)).toBe("refunded");
    expect(statusAfterRefund(1000, 0, 1000)).toBe("refunded");
  });

  it("starts konbini / bank payments as pending, card & QR by autoCapture", () => {
    expect(initialStatus("convenience", true)).toBe("pending");
    expect(initialStatus("bank", true)).toBe("pending");
    expect(initialStatus("credit", true)).toBe("captured");
    expect(initialStatus("qr", false)).toBe("authorized");
  });

  it("narrows raw strings", () => {
    expect(isPaymentStatus("captured")).toBe(true);
    expect(isPaymentStatus("CAPTURED")).toBe(false);
    expect(toPaymentStatus("refunded")).toBe("refunded");
    expect(() => toPaymentStatus("bogus")).toThrow();
  });
});
