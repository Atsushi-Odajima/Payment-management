// Merchant daily payment summary (Phase P2-2): one e-mail per merchant ×
// environment for the previous business day (Asia/Tokyo), sent by
// GET/POST /api/cron/merchant-daily-summary at 09:00 JST to merchants whose
// e-mail notification setting is "daily". Days without any transaction are
// skipped, and a summary already logged for the same merchant / mode / day is
// not sent again (the cron is safe to re-run).

import type { PrismaClient } from "@prisma/client";
import { formatYen } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/payments/methods";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { partsInTz, ymd } from "@/lib/settlements/schedule";
import { startOfDayInTz } from "@/lib/time";
import { CUSTOMER_EMAIL_LANG, sendTemplatedEmail } from "./send";
import { EMAIL_TEXTS } from "./templates";
import { modeLabelText } from "./hooks";

const COMPLETED = ["captured", "partially_refunded", "refunded", "chargeback"] as const;

export function methodLabelText(method: string | null, lang: "ja" | "en"): string {
  const def = CATEGORIES.find((c) => c.key === method);
  return def ? pickText(def.label, lang) : (method ?? "");
}

export interface MerchantDaySummary {
  merchantId: string;
  livemode: boolean;
  date: string;
  completedCount: number;
  completedAmount: number;
  byMethod: Array<{ method: PaymentMethod | "other"; count: number; amount: number }>;
  failedCount: number;
  expiredCount: number;
}

/** Aggregate one merchant × environment for the day starting at `dayStart` (business time zone). */
export async function summarizeMerchantDay(db: PrismaClient, opts: { merchantId: string; livemode: boolean; dayStart: Date }): Promise<MerchantDaySummary> {
  const dayEnd = new Date(opts.dayStart.getTime() + 86_400_000);
  const range = { gte: opts.dayStart, lt: dayEnd };
  const [completed, failedCount, expiredCount] = await Promise.all([
    db.payment.findMany({ where: { merchantId: opts.merchantId, livemode: opts.livemode, status: { in: [...COMPLETED] }, capturedAt: range }, select: { amount: true, method: true } }),
    db.payment.count({ where: { merchantId: opts.merchantId, livemode: opts.livemode, status: "failed", createdAt: range } }),
    db.paymentEvent.count({ where: { type: "expire", createdAt: range, payment: { merchantId: opts.merchantId, livemode: opts.livemode } } }),
  ]);
  const groups = new Map<string, { count: number; amount: number }>();
  for (const p of completed) {
    const key = p.method ?? "other";
    const g = groups.get(key) ?? { count: 0, amount: 0 };
    g.count++;
    g.amount += p.amount;
    groups.set(key, g);
  }
  return {
    merchantId: opts.merchantId,
    livemode: opts.livemode,
    date: ymd(partsInTz(opts.dayStart)),
    completedCount: completed.length,
    completedAmount: completed.reduce((s, p) => s + p.amount, 0),
    byMethod: [...groups.entries()].map(([method, g]) => ({ method: method as PaymentMethod | "other", ...g })).sort((a, b) => b.amount - a.amount),
    failedCount,
    expiredCount,
  };
}

/**
 * Send the previous day's summaries. `now` decides which day is "yesterday"
 * (business time zone). Returns how many merchants were considered and how
 * many e-mails were logged.
 */
export async function sendMerchantDailySummaries(db: PrismaClient, now: Date = new Date()): Promise<{ merchants: number; sent: number; skipped: number }> {
  const today = startOfDayInTz(now);
  const dayStart = new Date(today.getTime() - 86_400_000);
  const merchants = await db.merchant.findMany({ where: { emailNotification: "daily", email: { not: "" } }, select: { id: true, siteName: true, email: true } });
  let sent = 0;
  let skipped = 0;
  for (const m of merchants) {
    for (const livemode of [false, true]) {
      const summary = await summarizeMerchantDay(db, { merchantId: m.id, livemode, dayStart });
      if (summary.completedCount + summary.failedCount + summary.expiredCount === 0) {
        skipped++;
        continue;
      }
      // Already sent for this merchant / mode / day (re-run of the cron).
      const marker = `[${summary.date}/${livemode ? "live" : "test"}]`;
      const dup = await db.emailLog.findFirst({ where: { merchantId: m.id, templateKey: "merchant_daily_summary", createdAt: { gte: today }, body: { contains: marker } }, select: { id: true } });
      if (dup) {
        skipped++;
        continue;
      }
      const lang = CUSTOMER_EMAIL_LANG;
      const breakdown = summary.byMethod.length > 0 ? summary.byMethod.map((g) => `${methodLabelText(g.method, lang)}: ${g.count}${EMAIL_TEXTS.countUnit[lang]} ${formatYen(g.amount)}`).join("\n") : EMAIL_TEXTS.noCompleted[lang];
      const r = await sendTemplatedEmail(db, {
        key: "merchant_daily_summary",
        lang,
        to: m.email,
        vars: {
          merchantName: m.siteName,
          date: summary.date,
          mode: modeLabelText(livemode, lang),
          completedCount: String(summary.completedCount),
          completedAmount: formatYen(summary.completedAmount),
          methodBreakdown: `${breakdown}\n${marker}`,
          failedCount: String(summary.failedCount),
          expiredCount: String(summary.expiredCount),
        },
        merchantId: m.id,
      });
      if (r.status !== "skipped") sent++;
      else skipped++;
    }
  }
  return { merchants: merchants.length, sent, skipped };
}
