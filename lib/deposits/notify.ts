// Deposit notifications (入金通知) from the bank (virtual account) and the
// konbini network — one implementation behind POST /api/demo/deposit-notify
// and POST /api/demo/cvs-notify (Phase P1-1 … P1-3).
//
//   1. validate (mode is mandatory — a test notification must never touch a
//      live transaction, P1-2)
//   2. idempotency: the dedupe key is the sender's eventId when given,
//      otherwise sha256(source | transfer id or receipt no | amount |
//      receivedAt rounded to the minute | bankReference). A key seen before
//      is answered 200 { duplicate: true } and nothing is re-applied (P1-1)
//   3. decide: same-mode transaction still waiting → reconcile through the
//      normal `deposit` action; expired / cancelled / other-mode transaction
//      or no usable id → file an unmatched deposit (202) so support can apply
//      it as a late deposit or arrange a return (P1-3); a completed
//      transaction → 409 (recorded as rejected)
//
// Every notification — applied, duplicate, unmatched or rejected — is written
// to DepositNotification (the 入金通知ログ screen). The claim on `claimKey`
// (unique) is what makes duplicate detection race-free.

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ZodError } from "zod";
import { ApiError } from "@/lib/api/handler";
import type { AuditContext } from "@/lib/audit";
import { timingSafeEqualBytes } from "@/lib/auth";
import { isUniqueViolation, nextCode } from "@/lib/ids";
import {
  applyPaymentAction,
  type ApplyActionResult,
} from "@/lib/payments/actions";
import { isCvsReceiptNoFormat } from "@/lib/payments/konbini";
import { WAITING_STATUSES } from "@/lib/payments/transitions";
import { registerUnmatchedDeposit } from "./service";
import {
  bankNotifySchema,
  cvsNotifySchema,
  type DepositNotificationReason,
  type DepositNotificationResult,
  type DepositNotificationSource,
} from "./notification-types";
import { isUnmatchedDepositReason } from "./types";

export const NOTIFICATION_CODE_PREFIX = "DN";

/**
 * Bearer check shared by the bank and konbini demo notifications:
 * `Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>`. Without the variable the
 * endpoints are open outside production and disabled (404) in production.
 */
export function requireNotifySecret(req: Request): void {
  const secret = process.env.DEPOSIT_NOTIFY_SECRET;
  if (secret) {
    const given = (req.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const enc = new TextEncoder();
    if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
      throw new ApiError(401, "unauthorized", "errors.unauthorized");
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new ApiError(404, "not_found", "errors.notFound");
  }
}

export const DEPOSIT_NOTIFICATION_SELECT = {
  id: true,
  notificationNo: true,
  source: true,
  eventId: true,
  livemode: true,
  transferId: true,
  cvsReceiptNo: true,
  amount: true,
  receivedAt: true,
  payerName: true,
  bankReference: true,
  result: true,
  resultReason: true,
  paymentId: true,
  unmatchedDepositId: true,
  duplicateOfId: true,
  createdAt: true,
  payment: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      merchant: { select: { merchantCode: true, siteName: true } },
    },
  },
} as const;

/** Dedupe key: the sender's event id (scoped by source) or a content hash. */
export function depositDedupeKey(input: {
  source: DepositNotificationSource;
  eventId?: string | null;
  id: string;
  amount: number;
  receivedAt: Date;
  bankReference?: string | null;
}): string {
  if (input.eventId) return `${input.source}:evt:${input.eventId}`;
  const minute = Math.floor(input.receivedAt.getTime() / 60_000);
  return (
    `${input.source}:h:` +
    createHash("sha256")
      .update(
        `${input.source}|${input.id}|${input.amount}|${minute}|${input.bankReference ?? ""}`,
      )
      .digest("hex")
  );
}

function fieldErrorsOf(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const key = i.path.join(".") || "body";
    out[key] =
      i.code === "invalid_type" &&
      (i as { received?: string }).received === "undefined"
        ? "required"
        : "invalid";
  }
  return out;
}

export interface NotifyOutcome {
  /** HTTP status the route should answer with. */
  status: 200 | 202 | 404 | 409;
  body: Record<string, unknown>;
}

interface Decision {
  result: DepositNotificationResult;
  reason: DepositNotificationReason | null;
  payment: {
    id: string;
    amount: number;
    status: string;
    livemode: boolean;
  } | null;
}

async function nextNotificationNo(db: PrismaClient): Promise<string> {
  return nextCode(NOTIFICATION_CODE_PREFIX, async () => {
    const last = await db.depositNotification.findFirst({
      orderBy: { notificationNo: "desc" },
      select: { notificationNo: true },
    });
    return last?.notificationNo ?? null;
  });
}

/**
 * Handle one notification end to end. Throws ApiError(400) for invalid input
 * (nothing is recorded — the sender gets the validation error back and can
 * fix the request), otherwise always records a DepositNotification row.
 */
export async function processDepositNotification(
  db: PrismaClient,
  opts: {
    source: DepositNotificationSource;
    raw: unknown;
    audit: AuditContext;
    now?: Date;
  },
): Promise<NotifyOutcome> {
  const now = opts.now ?? new Date();
  const { source } = opts;

  // 1. Validate.
  const parsed =
    source === "bank"
      ? bankNotifySchema.safeParse(opts.raw)
      : cvsNotifySchema.safeParse(opts.raw);
  if (!parsed.success)
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, {
      fieldErrors: fieldErrorsOf(parsed.error),
    });
  const input = parsed.data;
  const livemode = input.mode === "live";
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : now;
  if (Number.isNaN(receivedAt.getTime()))
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, {
      fieldErrors: { receivedAt: "date" },
    });

  const transferId =
    source === "bank" ? (input as { transferId: string }).transferId : "";
  const receiptNo =
    source === "cvs"
      ? (input as { receiptNo: string }).receiptNo.replace(/-/g, "")
      : "";
  const idValid =
    source === "bank"
      ? /^\d{7,8}$/.test(transferId)
      : isCvsReceiptNoFormat(receiptNo);
  const payerName =
    source === "bank" ? (input as { payerName: string }).payerName : "";
  const bankReference =
    source === "bank" ? (input as { bankReference: string }).bankReference : "";

  // 2. Look the transaction up and decide.
  const payment = idValid
    ? await db.payment.findUnique({
        where: source === "bank" ? { transferId } : { cvsReceiptNo: receiptNo },
        select: { id: true, amount: true, status: true, livemode: true },
      })
    : null;
  // Bank notifications always carry the amount; a konbini notification defaults
  // to the slip amount (0 when the slip is unknown — recorded as rejected).
  const amount = (input as { amount?: number }).amount ?? payment?.amount ?? 0;

  const decision: Decision = !payment
    ? source === "cvs"
      ? {
          result: "rejected",
          reason: idValid ? "not_found" : "no_id",
          payment: null,
        }
      : {
          result: "unmatched",
          reason: idValid ? "not_found" : "no_id",
          payment: null,
        }
    : payment.livemode !== livemode
      ? { result: "unmatched", reason: "mode_mismatch", payment }
      : payment.status === "expired"
        ? { result: "unmatched", reason: "late_deposit", payment }
        : payment.status === "cancelled"
          ? { result: "unmatched", reason: "cancelled_deposit", payment }
          : (WAITING_STATUSES as readonly string[]).includes(payment.status)
            ? { result: "applied", reason: null, payment }
            : { result: "rejected", reason: "invalid_status", payment };

  // 3. Claim the dedupe key; a second claim means a re-sent notification.
  const dedupeKey = depositDedupeKey({
    source,
    eventId: input.eventId,
    id: source === "bank" ? transferId : receiptNo,
    amount,
    receivedAt,
    bankReference,
  });
  const base = {
    source,
    eventId: input.eventId ?? null,
    dedupeKey,
    livemode,
    transferId: source === "bank" ? transferId || null : null,
    cvsReceiptNo: source === "cvs" ? receiptNo || null : null,
    amount,
    receivedAt,
    payerName: payerName || null,
    bankReference: bankReference || null,
    rawBody: JSON.stringify(opts.raw ?? null).slice(0, 4000),
    createdAt: now,
  };

  let rowId: string | null = null;
  // Fast path for a re-sent notification (the unique claim below still guards the race).
  const seen = await db.depositNotification.findFirst({
    where: { claimKey: dedupeKey },
    select: { id: true },
  });
  for (let attempt = 0; attempt < 2 && rowId === null && !seen; attempt++) {
    try {
      const row = await db.depositNotification.create({
        data: {
          ...base,
          notificationNo: await nextNotificationNo(db),
          claimKey: dedupeKey,
          result: decision.result,
          resultReason: decision.reason,
          paymentId: decision.payment?.id ?? null,
        },
        select: { id: true },
      });
      rowId = row.id;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // The collision was on notificationNo (concurrent insert) → recompute once; on claimKey → duplicate.
      if (
        !(await db.depositNotification.findFirst({
          where: { claimKey: dedupeKey },
          select: { id: true },
        }))
      )
        continue;
      break;
    }
  }
  if (rowId === null) {
    const original = await db.depositNotification.findFirst({
      where: { claimKey: dedupeKey },
      select: {
        id: true,
        notificationNo: true,
        paymentId: true,
        result: true,
        unmatchedDepositId: true,
      },
    });
    if (original) {
      // Duplicate: record it (no claim) and answer without re-applying anything.
      const dup = await db.depositNotification.create({
        data: {
          ...base,
          notificationNo: await nextNotificationNo(db),
          claimKey: null,
          result: "duplicate",
          resultReason: null,
          paymentId: original.paymentId,
          duplicateOfId: original.id,
          unmatchedDepositId: original.unmatchedDepositId,
        },
        select: { id: true, notificationNo: true },
      });
      return {
        status: 200,
        body: {
          duplicate: true,
          notificationId: original.id,
          notificationNo: original.notificationNo,
          duplicateNotificationId: dup.id,
          paymentId: original.paymentId,
          unmatchedDepositId: original.unmatchedDepositId,
          result: original.result,
        },
      };
    }
    throw new ApiError(409, "conflict", "errors.conflict");
  }
  const notificationNo = (
    await db.depositNotification.findUniqueOrThrow({
      where: { id: rowId },
      select: { notificationNo: true },
    })
  ).notificationNo;

  // 4. Apply.
  const common = {
    notificationId: rowId,
    notificationNo,
    duplicate: false,
    received: amount,
  };
  if (decision.result === "applied" && decision.payment) {
    let result: ApplyActionResult;
    try {
      result = await applyPaymentAction(db, {
        paymentId: decision.payment.id,
        action: "deposit",
        amount,
        actor: source,
        audit: opts.audit,
      });
    } catch (e) {
      await db.depositNotification.update({
        where: { id: rowId },
        data: { result: "rejected", resultReason: "apply_failed" },
      });
      throw e;
    }
    return {
      status: 200,
      body: {
        ...common,
        matched: true,
        transferId: source === "bank" ? transferId : undefined,
        receiptNo: source === "cvs" ? receiptNo : undefined,
        paymentId: decision.payment.id,
        amount: decision.payment.amount,
        depositAmount: result.depositAmount,
        depositDiff: result.depositDiff,
        status: result.status,
        completed: result.status === "captured",
      },
    };
  }

  if (decision.result === "unmatched") {
    const deposit = await registerUnmatchedDeposit(db, {
      input: {
        amount,
        payerName: payerName || "(unknown)",
        receivedAt: receivedAt.toISOString(),
        bankReference,
        givenTransferId: source === "bank" ? transferId : receiptNo,
        note: "",
      },
      livemode,
      source,
      reason: isUnmatchedDepositReason(decision.reason)
        ? decision.reason
        : null,
      candidatePaymentId: decision.payment?.id ?? null,
      audit: opts.audit,
      now,
    });
    await db.depositNotification.update({
      where: { id: rowId },
      data: { unmatchedDepositId: deposit.id },
    });
    return {
      status: 202,
      body: {
        ...common,
        matched: false,
        reason:
          decision.reason === "no_id" || decision.reason === "not_found"
            ? "not_found"
            : decision.reason,
        transferId: source === "bank" ? transferId || null : undefined,
        receiptNo: source === "cvs" ? receiptNo : undefined,
        paymentId: decision.payment?.id ?? null,
        unmatchedDepositId: deposit.id,
      },
    };
  }

  // Rejected: an unknown receipt number (404) or a transaction that no longer accepts money (409).
  if (decision.reason === "not_found" || decision.reason === "no_id") {
    throw new ApiError(
      404,
      "receipt_not_found",
      "errors.cvsReceiptNotFound",
      undefined,
      { notificationId: rowId },
    );
  }
  throw new ApiError(
    409,
    "invalid_transition",
    "errors.depositOnlyAwaiting",
    undefined,
    { notificationId: rowId, paymentId: decision.payment?.id ?? null },
  );
}
