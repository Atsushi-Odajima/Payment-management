// Single source of truth for the payment status state machine.
//
// Every API route, UI action, and webhook handler derives "is this allowed?"
// from TRANSITIONS below, and routes apply changes with a status-conditioned
// updateMany so two concurrent requests cannot both succeed (no
// check-then-act race). See README "Design decisions" for the diagram.

export const PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "captured",
  "partially_refunded",
  "refunded",
  "cancelled",
  "failed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
  );
}

/** Convert a raw DB string to PaymentStatus, throwing on unknown values. */
export function toPaymentStatus(value: string): PaymentStatus {
  if (!isPaymentStatus(value)) {
    throw new Error(`Unknown payment status: ${value}`);
  }
  return value;
}

export const PAYMENT_ACTIONS = ["capture", "cancel", "refund", "fail"] as const;
export type PaymentAction = (typeof PAYMENT_ACTIONS)[number];

export function isPaymentAction(value: unknown): value is PaymentAction {
  return (
    typeof value === "string" &&
    (PAYMENT_ACTIONS as readonly string[]).includes(value)
  );
}

export interface Transition {
  /** Statuses from which this action is legal. */
  from: readonly PaymentStatus[];
  /** Resulting status (refund may land on partially_refunded instead). */
  to: PaymentStatus;
  /** Timestamp column stamped when the transition completes. */
  stampField?: "capturedAt" | "cancelledAt" | "refundedAt";
}

export const TRANSITIONS: Record<PaymentAction, Transition> = {
  capture: {
    from: ["pending", "authorized"],
    to: "captured",
    stampField: "capturedAt",
  },
  cancel: {
    from: ["pending", "authorized"],
    to: "cancelled",
    stampField: "cancelledAt",
  },
  refund: {
    from: ["captured", "partially_refunded"],
    to: "refunded",
    stampField: "refundedAt",
  },
  // Only reachable through provider notifications (webhook), never from the UI.
  fail: {
    from: ["pending", "authorized"],
    to: "failed",
  },
};

/** Actions the dashboard UI may trigger directly. */
export const UI_ACTIONS: readonly PaymentAction[] = ["capture", "cancel", "refund"];

export function canTransition(status: PaymentStatus, action: PaymentAction): boolean {
  return TRANSITIONS[action].from.includes(status);
}

/** Statuses with no outgoing transitions. */
export const TERMINAL_STATUSES: readonly PaymentStatus[] = PAYMENT_STATUSES.filter(
  (s) => !PAYMENT_ACTIONS.some((a) => canTransition(s, a)),
);

/**
 * Resolve the status after refunding `refundAmount` more on a payment of
 * `amount` that already has `alreadyRefunded` refunded.
 */
export function statusAfterRefund(
  amount: number,
  alreadyRefunded: number,
  refundAmount: number,
): PaymentStatus {
  return alreadyRefunded + refundAmount >= amount ? "refunded" : "partially_refunded";
}

/**
 * Categories whose payments are confirmed asynchronously by the customer
 * (paying at a konbini counter / bank transfer). They start as `pending` and
 * move to `captured` when the provider notifies us.
 */
export const ASYNC_CATEGORIES: readonly string[] = ["convenience", "bank"];

/** Initial status for a newly created payment. */
export function initialStatus(category: string, autoCapture: boolean): PaymentStatus {
  if (ASYNC_CATEGORIES.includes(category)) return "pending";
  return autoCapture ? "captured" : "authorized";
}

/** Error key (errors.*) to show when `action` is not allowed from `status`. */
export function transitionErrorKey(action: PaymentAction): "cannotCapture" | "cannotCancel" | "refundOnlyCaptured" | "conflict" {
  switch (action) {
    case "capture":
      return "cannotCapture";
    case "cancel":
      return "cannotCancel";
    case "refund":
      return "refundOnlyCaptured";
    default:
      return "conflict";
  }
}
