import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  MASTER_ACTIONS,
  PAYMENT_ACTIONS,
  PAYMENT_STATUSES,
  SALES_STATUSES,
  TERMINAL_STATUSES,
  UI_ACTIONS,
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
  pending: ["capture", "cancel", "fail", "expire", "deposit"],
  awaiting_transfer: ["capture", "cancel", "fail", "expire", "deposit"],
  authorized: ["capture", "cancel", "fail"],
  captured: ["refund", "chargeback"],
  partially_refunded: ["refund", "chargeback"],
  refunded: ["chargeback"],
  cancelled: [],
  failed: [],
  expired: [],
  chargeback: [],
};

describe("payment state machine", () => {
  describe.each(PAYMENT_STATUSES)("from %s", (status) => {
    it.each(PAYMENT_ACTIONS)("%s", (action) => {
      expect(canTransition(status, action)).toBe(LEGAL[status].includes(action));
    });
  });

  it("marks refunded / cancelled / failed / expired as terminal", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(["cancelled", "chargeback", "expired", "failed"]);
  });

  it("splits every status between the application list and the sales list", () => {
    const union = [...APPLICATION_STATUSES, ...SALES_STATUSES].sort();
    expect(union).toEqual([...PAYMENT_STATUSES].sort());
    expect(APPLICATION_STATUSES.some((s) => SALES_STATUSES.includes(s))).toBe(false);
  });

  it("gates every UI action except refund behind the master role", () => {
    expect([...MASTER_ACTIONS].sort()).toEqual(UI_ACTIONS.filter((a) => a !== "refund").sort());
  });

  it("resolves the status after a refund", () => {
    expect(statusAfterRefund(1000, 0, 400)).toBe("partially_refunded");
    expect(statusAfterRefund(1000, 400, 600)).toBe("refunded");
    expect(statusAfterRefund(1000, 0, 1000)).toBe("refunded");
  });

  it("starts bank transfers awaiting transfer, konbini applied, card & QR by autoCapture", () => {
    expect(initialStatus("bank", true)).toBe("awaiting_transfer");
    expect(initialStatus("convenience", true)).toBe("pending");
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
