// Single source of truth for the payment status state machine.
//
// A row in the Payment table is a transaction (決済申請) from the moment the
// customer picks a payment method at checkout until it is completed, refunded
// or abandoned. "Payment applications" (決済申請一覧) and "payments" (決済一覧)
// are the same table filtered by status — see APPLICATION_STATUSES and
// SALES_STATUSES below.
//
// Every API route, UI action, and webhook handler derives "is this allowed?"
// from TRANSITIONS, and lib/payments/actions.ts applies changes with a
// status-conditioned updateMany so two concurrent requests cannot both
// succeed (no check-then-act race). See README "Design decisions".

export const PAYMENT_STATUSES = [
  "pending", // 申請中: created at checkout, nothing confirmed yet
  "awaiting_transfer", // 振込待ち: bank transfer id issued, waiting for the deposit
  "authorized", // 与信済: card / QR authorization held
  "captured", // 完了
  "partially_refunded",
  "refunded", // 返金済
  "cancelled", // キャンセル
  "failed", // 失敗
  "expired", // 期限切れ
  "chargeback", // チャージバック (lost / confirmed dispute, Phase F)
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

/** Statuses shown on the 決済申請一覧 (transactions not yet completed). */
export const APPLICATION_STATUSES: readonly PaymentStatus[] = [
  "pending",
  "awaiting_transfer",
  "authorized",
  "failed",
  "expired",
  "cancelled",
];

/** Statuses shown on the 決済一覧 (completed sales, including refunds). */
export const SALES_STATUSES: readonly PaymentStatus[] = ["captured", "partially_refunded", "refunded", "chargeback"];

/** Statuses that still expect an outcome (counted as "open" on the dashboard). */
export const OPEN_STATUSES: readonly PaymentStatus[] = ["pending", "awaiting_transfer", "authorized"];

export const PAYMENT_ACTIONS = ["capture", "cancel", "refund", "fail", "expire", "deposit", "chargeback"] as const;
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
  /** Nominal resulting status (refund may land on partially_refunded, deposit may stay awaiting_transfer). */
  to: PaymentStatus;
  /** Timestamp column stamped when the transition reaches `to`. */
  stampField?: "capturedAt" | "cancelledAt" | "refundedAt";
}

export const TRANSITIONS: Record<PaymentAction, Transition> = {
  // 完了にする — also the webhook's payment.captured.
  capture: {
    from: ["pending", "authorized", "awaiting_transfer"],
    to: "captured",
    stampField: "capturedAt",
  },
  cancel: {
    from: ["pending", "authorized", "awaiting_transfer"],
    to: "cancelled",
    stampField: "cancelledAt",
  },
  refund: {
    from: ["captured", "partially_refunded"],
    to: "refunded",
    stampField: "refundedAt",
  },
  // 失敗にする — manual (master) or the webhook's payment.failed.
  fail: {
    from: ["pending", "authorized", "awaiting_transfer"],
    to: "failed",
  },
  // 期限切れ — a transfer / konbini deadline passed without payment.
  expire: {
    from: ["pending", "awaiting_transfer"],
    to: "expired",
  },
  // 入金消込 — bank transfer (awaiting_transfer) and the konbini payment
  // notification (pending, Phase K). Lands on captured when the deposits cover
  // the amount, otherwise stays put with depositDiff = short.
  deposit: {
    from: ["awaiting_transfer", "pending"],
    to: "captured",
    stampField: "capturedAt",
  },
  // チャージバック — applied by lib/chargebacks/service.ts when a dispute is
  // lost or confirmed; never offered as a direct UI action.
  chargeback: {
    from: ["captured", "partially_refunded", "refunded"],
    to: "chargeback",
  },
};

/** Actions the dashboard UI may trigger directly. */
export const UI_ACTIONS: readonly PaymentAction[] = ["capture", "cancel", "refund", "fail", "expire", "deposit"];

/**
 * Actions on the application stage (before completion) require the master
 * role; refunds keep the pre-existing rule (any logged-in operator).
 * Enforced in app/api/payments/[id]/[action]/route.ts via requireMaster.
 */
export const MASTER_ACTIONS: readonly PaymentAction[] = ["capture", "cancel", "fail", "expire", "deposit"];

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
 * (paying at a konbini counter / bank transfer). They never start captured.
 */
export const ASYNC_CATEGORIES: readonly string[] = ["convenience", "bank"];

/** Initial status for a newly created transaction. */
export function initialStatus(category: string, autoCapture: boolean): PaymentStatus {
  if (category === "bank") return "awaiting_transfer";
  if (ASYNC_CATEGORIES.includes(category)) return "pending";
  return autoCapture ? "captured" : "authorized";
}

/** Error key (errors.*) to show when `action` is not allowed from `status`. */
export function transitionErrorKey(
  action: PaymentAction,
): "cannotCapture" | "cannotCancel" | "refundOnlyCaptured" | "depositOnlyAwaiting" | "conflict" {
  switch (action) {
    case "capture":
      return "cannotCapture";
    case "cancel":
      return "cannotCancel";
    case "refund":
      return "refundOnlyCaptured";
    case "deposit":
      return "depositOnlyAwaiting";
    default:
      return "conflict";
  }
}
