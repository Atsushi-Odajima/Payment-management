// Event → email hooks (Phase G-2). Each loads what the template needs and
// calls sendTemplatedEmail; every hook is safe to fire-and-forget (errors are
// logged, never thrown), so business operations do not fail on email.

import type { PrismaClient } from "@prisma/client";
import { formatDateTime } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";
import { CUSTOMER_EMAIL_LANG, sendTemplatedEmail } from "./send";
import { EMAIL_TEXTS, cvsBrandName, type EmailVars } from "./templates";
import { formatCvsReceiptNo } from "@/lib/payments/konbini";
import { methodLabelText } from "./merchant-digest";

const PAYMENT_SELECT = {
  id: true,
  orderNumber: true,
  amount: true,
  productName: true,
  customerName: true,
  customerEmail: true,
  transferId: true,
  transferDueAt: true,
  depositAmount: true,
  cvsBrand: true,
  cvsReceiptNo: true,
  merchantId: true,
  merchant: { select: { siteName: true } },
} as const;

async function paymentVars(db: PrismaClient, paymentId: string): Promise<{ to: string | null; merchantId: string | null; vars: EmailVars } | null> {
  const p = await db.payment.findUnique({ where: { id: paymentId }, select: PAYMENT_SELECT });
  if (!p) return null;
  return {
    to: p.customerEmail,
    merchantId: p.merchantId,
    vars: {
      merchantName: p.merchant?.siteName ?? "",
      customerName: p.customerName ?? "",
      amount: formatYen(p.amount),
      transferId: p.transferId ?? "",
      deadline: p.transferDueAt ? formatDateTime(p.transferDueAt, CUSTOMER_EMAIL_LANG) : "",
      transactionId: p.id,
      orderNumber: p.orderNumber,
      productName: p.productName ?? "",
      shortAmount: formatYen(Math.max(0, p.amount - (p.depositAmount ?? 0))),
      receiptNo: p.cvsReceiptNo ? formatCvsReceiptNo(p.cvsReceiptNo) : "",
      cvsBrand: cvsBrandName(p.cvsBrand, CUSTOMER_EMAIL_LANG),
    },
  };
}

async function sendForPayment(db: PrismaClient, paymentId: string, key: "transfer_guide" | "cvs_guide" | "payment_completed" | "refund_completed" | "deposit_short", overrides: EmailVars = {}): Promise<void> {
  try {
    const ctx = await paymentVars(db, paymentId);
    if (!ctx || !ctx.to) return;
    await sendTemplatedEmail(db, { key, lang: CUSTOMER_EMAIL_LANG, to: ctx.to, vars: { ...ctx.vars, ...overrides }, paymentId, merchantId: ctx.merchantId });
  } catch (e) {
    console.error(`[email] ${key} failed`, e);
  }
}

/** A bank transfer id was issued at checkout. */
export const notifyTransferIssued = (db: PrismaClient, paymentId: string) => sendForPayment(db, paymentId, "transfer_guide");
/** A konbini receipt number was issued at checkout (Phase K-1). */
export const notifyCvsIssued = (db: PrismaClient, paymentId: string) => sendForPayment(db, paymentId, "cvs_guide");
/** The transaction completed (capture / matching deposit). */
export const notifyPaymentCompleted = (db: PrismaClient, paymentId: string) => sendForPayment(db, paymentId, "payment_completed");
/** A refund was approved and completed. */
export const notifyRefundCompleted = (db: PrismaClient, paymentId: string, refundAmount: number) => sendForPayment(db, paymentId, "refund_completed", { amount: formatYen(refundAmount) });
/** A short deposit was recorded and the operator asked the customer for the balance. */
export const notifyDepositShort = (db: PrismaClient, paymentId: string) => sendForPayment(db, paymentId, "deposit_short");

/**
 * Merchant notice of a completed payment (Phase P2-2): sent to the merchant's
 * contact e-mail when the merchant's e-mail notification setting is
 * "per_payment". "daily" merchants get the morning summary instead
 * (lib/email/merchant-digest.ts); "none" gets nothing.
 */
export async function notifyMerchantPaymentCompleted(db: PrismaClient, paymentId: string): Promise<void> {
  try {
    const p = await db.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, orderNumber: true, amount: true, method: true, livemode: true, capturedAt: true, merchantId: true, merchant: { select: { siteName: true, email: true, emailNotification: true } } },
    });
    if (!p?.merchant || !p.merchantId || p.merchant.emailNotification !== "per_payment" || !p.merchant.email) return;
    await sendTemplatedEmail(db, {
      key: "merchant_payment_notice",
      lang: CUSTOMER_EMAIL_LANG,
      to: p.merchant.email,
      vars: {
        merchantName: p.merchant.siteName,
        orderNumber: p.orderNumber,
        amount: formatYen(p.amount),
        paymentMethod: methodLabelText(p.method, CUSTOMER_EMAIL_LANG),
        completedAt: formatDateTime(p.capturedAt ?? new Date(), CUSTOMER_EMAIL_LANG),
        transactionId: p.id,
        mode: modeLabelText(p.livemode, CUSTOMER_EMAIL_LANG),
      },
      paymentId: p.id,
      merchantId: p.merchantId,
    });
  } catch (e) {
    console.error("[email] merchant_payment_notice failed", e);
  }
}

export function modeLabelText(livemode: boolean, lang: "ja" | "en"): string {
  return (livemode ? EMAIL_TEXTS.modeLive : EMAIL_TEXTS.modeTest)[lang];
}

async function subscriptionVars(db: PrismaClient, subscriptionId: string) {
  const s = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { customerName: true, customerEmail: true, merchantId: true, merchant: { select: { siteName: true } }, plan: { select: { name: true, amount: true } } } });
  if (!s) return null;
  return { to: s.customerEmail, merchantId: s.merchantId, vars: { merchantName: s.merchant.siteName, customerName: s.customerName, amount: formatYen(s.plan.amount), planName: s.plan.name } as EmailVars };
}

/** A recurring charge failed; the retry date is included. */
export async function notifySubscriptionFailed(db: PrismaClient, subscriptionId: string, retryAt: Date): Promise<void> {
  try {
    const ctx = await subscriptionVars(db, subscriptionId);
    if (!ctx || !ctx.to) return;
    await sendTemplatedEmail(db, { key: "subscription_failed", lang: CUSTOMER_EMAIL_LANG, to: ctx.to, vars: { ...ctx.vars, retryDate: formatDateTime(retryAt, CUSTOMER_EMAIL_LANG).slice(0, 10) }, merchantId: ctx.merchantId });
  } catch (e) {
    console.error("[email] subscription_failed failed", e);
  }
}

/** The third consecutive failure suspended the subscription. */
export async function notifySubscriptionSuspended(db: PrismaClient, subscriptionId: string): Promise<void> {
  try {
    const ctx = await subscriptionVars(db, subscriptionId);
    if (!ctx || !ctx.to) return;
    await sendTemplatedEmail(db, { key: "subscription_suspended", lang: CUSTOMER_EMAIL_LANG, to: ctx.to, vars: ctx.vars, merchantId: ctx.merchantId });
  } catch (e) {
    console.error("[email] subscription_suspended failed", e);
  }
}

/** A new operator account was created (the initial password is shown in the UI too). */
export async function notifyAdminInvite(db: PrismaClient, input: { email: string; loginId: string; initialPassword: string; loginUrl: string; lang: "ja" | "en" }): Promise<void> {
  try {
    await sendTemplatedEmail(db, { key: "admin_invite", lang: input.lang, to: input.email, vars: { loginId: input.loginId, initialPassword: input.initialPassword, loginUrl: input.loginUrl } });
  } catch (e) {
    console.error("[email] admin_invite failed", e);
  }
}
