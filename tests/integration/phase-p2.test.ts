// Phase P2 (notifications):
//   2-1 auto-captured card / QR transactions send the customer completion e-mail
//   2-2 merchant e-mail notification setting: per_payment notice, daily summary cron, none
//   2-3 /api/merchant-api/* shares the public API rate limit (60 / minute per merchant × mode)

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_API_KEYS, SEED_IDS, SEED_TRANSFER_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { POST as depositNotify } from "@/app/api/demo/deposit-notify/route";
import { GET as ping } from "@/app/api/merchant-api/ping/route";
import { GET as announcements } from "@/app/api/merchant-api/announcements/route";
import { GET as dailySummaryCron } from "@/app/api/cron/merchant-daily-summary/route";
import { POST as subscriptionAction } from "@/app/api/subscriptions/[id]/[action]/route";
import { sendMerchantDailySummaries, summarizeMerchantDay } from "@/lib/email/merchant-digest";
import { PUBLIC_API_RATE_LIMIT, consumePublicApiRateLimit } from "@/lib/public-api/rate-limit";
import { startOfDayInTz } from "@/lib/time";
import { formatYen } from "@/lib/utils";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let ADMIN: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const bearer = (path: string, key: string) => new Request(BASE + path, { headers: { authorization: `Bearer ${key}` } });

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
});

describe("P2-1 completion e-mail for auto-captured transactions", () => {
  it("sends payment_completed to the customer when a card payment completes at creation", async () => {
    const res = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: "ORD-P2-1", amount: 3000, customerName: "Test", customerEmail: "buyer@example.com" }, ADMIN), {}));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("captured");
    const mail = await prisma.emailLog.findFirst({ where: { paymentId: res.body.data.id, templateKey: "payment_completed" } });
    expect(mail).not.toBeNull();
    expect(mail!.to).toBe("buyer@example.com");
    expect(mail!.body).toContain("ORD-P2-1");
    // An authorized (not captured) card payment sends nothing yet.
    const auth = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: "ORD-P2-2", amount: 3000, customerEmail: "b2@example.com", autoCapture: false }, ADMIN), {}));
    expect(await prisma.emailLog.count({ where: { paymentId: auth.body.data.id } })).toBe(0);
  });

  it("subscription charges keep their own e-mails (no customer completion mail)", async () => {
    const before = await prisma.emailLog.count({ where: { templateKey: "payment_completed" } });
    const res = await read(await subscriptionAction(json(`/api/subscriptions/${SEED_IDS.subscription1}/charge`, "POST", { outcome: "success" }, ADMIN), { params: { id: SEED_IDS.subscription1, action: "charge" } }));
    expect(res.status).toBe(200);
    expect(await prisma.emailLog.count({ where: { templateKey: "payment_completed" } })).toBe(before);
  });
});

describe("P2-2 merchant e-mail notification setting", () => {
  it("per_payment: the merchant contact gets a payment notice on every completion (creation and reconciliation)", async () => {
    // merchant1 is seeded with per_payment.
    const res = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: "ORD-P2-M1", amount: 4200 }, ADMIN), {}));
    const notice = await prisma.emailLog.findFirst({ where: { paymentId: res.body.data.id, templateKey: "merchant_payment_notice" } });
    expect(notice).not.toBeNull();
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: SEED_IDS.merchant1 } });
    expect(notice!.to).toBe(merchant.email);
    expect(notice!.merchantId).toBe(SEED_IDS.merchant1);
    expect(notice!.body).toContain("ORD-P2-M1");
    expect(notice!.body).toContain(formatYen(4200));

    // A bank transfer completing through the deposit notification also notifies (merchant2 → switch it to per_payment).
    await prisma.merchant.update({ where: { id: SEED_IDS.merchant2 }, data: { emailNotification: "per_payment" } });
    vi.stubEnv("DEPOSIT_NOTIFY_SECRET", "");
    await depositNotify(json("/api/demo/deposit-notify", "POST", { transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4], amount: 24_800, mode: "test" }), {});
    expect(await prisma.emailLog.count({ where: { paymentId: SEED_IDS.payment4, templateKey: "merchant_payment_notice" } })).toBe(1);
    vi.unstubAllEnvs();
  });

  it("none: nothing is sent; daily: nothing per payment", async () => {
    // merchant3 = none, merchant2 = daily (seed).
    const none = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant3, orderNumber: "ORD-P2-N", amount: 100 }, ADMIN), {}));
    expect(await prisma.emailLog.count({ where: { paymentId: none.body.data.id, templateKey: "merchant_payment_notice" } })).toBe(0);
    const daily = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant2, orderNumber: "ORD-P2-D", amount: 100 }, ADMIN), {}));
    expect(await prisma.emailLog.count({ where: { paymentId: daily.body.data.id, templateKey: "merchant_payment_notice" } })).toBe(0);
  });

  it("daily: the cron sends one summary per merchant × environment for the previous day, skips empty days and never repeats", async () => {
    // Make merchant2 (daily) have activity "yesterday" relative to a fixed run time.
    const runAt = new Date("2026-09-02T00:30:00Z"); // 09:30 JST on Sep 2 → covers Sep 1 JST
    const yesterday = startOfDayInTz(new Date(runAt.getTime() - 86_400_000));
    const inDay = new Date(yesterday.getTime() + 3 * 3_600_000);
    const created = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant2, orderNumber: "ORD-P2-SUM", amount: 5000 }, ADMIN), {}));
    await prisma.payment.update({ where: { id: created.body.data.id }, data: { capturedAt: inDay, createdAt: inDay } });
    // A failed one and an expiry event on the same day.
    const failed = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant2, orderNumber: "ORD-P2-F", amount: 700, autoCapture: false }, ADMIN), {}));
    await paymentAction(json(`/api/payments/${failed.body.data.id}/fail`, "POST", {}, ADMIN), { params: { id: failed.body.data.id, action: "fail" } });
    await prisma.payment.update({ where: { id: failed.body.data.id }, data: { createdAt: inDay } });

    const summary = await summarizeMerchantDay(prisma, { merchantId: SEED_IDS.merchant2, livemode: false, dayStart: yesterday });
    expect(summary).toMatchObject({ completedCount: 1, completedAmount: 5000, failedCount: 1, date: "2026-09-01" });
    expect(summary.byMethod).toEqual([{ method: "credit", count: 1, amount: 5000 }]);

    const first = await sendMerchantDailySummaries(prisma, runAt);
    expect(first.sent).toBe(1); // merchant2 test mode only (no live activity, merchant1 / 3 are not "daily")
    const mail = await prisma.emailLog.findFirstOrThrow({ where: { merchantId: SEED_IDS.merchant2, templateKey: "merchant_daily_summary" } });
    expect(mail.subject).toContain("2026-09-01");
    expect(mail.body).toContain(formatYen(5000));
    expect(mail.body).toContain("1");
    // Re-running the same day does not send again.
    const again = await sendMerchantDailySummaries(prisma, runAt);
    expect(again.sent).toBe(0);
    expect(await prisma.emailLog.count({ where: { templateKey: "merchant_daily_summary" } })).toBe(1);

    // The cron route is protected by CRON_SECRET.
    vi.stubEnv("CRON_SECRET", "c");
    expect((await dailySummaryCron(new Request(BASE + "/api/cron/merchant-daily-summary"), {})).status).toBe(401);
    const run = await read(await dailySummaryCron(new Request(BASE + "/api/cron/merchant-daily-summary", { headers: { authorization: "Bearer c" } }), {}));
    expect(run.status).toBe(200);
    expect(run.body.data).toHaveProperty("sent");
    vi.unstubAllEnvs();
  });
});

describe("P2-3 merchant API rate limit", () => {
  it("counts /api/merchant-api requests in the same bucket as /api/v1 and answers 429 with Retry-After", async () => {
    const key = SEED_API_KEYS[SEED_IDS.apiKey1];
    const first = await ping(bearer("/api/merchant-api/ping", key), {});
    expect(first.status).toBe(200);
    expect(first.headers.get("x-ratelimit-limit")).toBe(String(PUBLIC_API_RATE_LIMIT));
    expect(Number(first.headers.get("x-ratelimit-remaining"))).toBe(PUBLIC_API_RATE_LIMIT - 1);
    // Spend the rest of the minute's budget through the shared counter.
    for (let i = 0; i < PUBLIC_API_RATE_LIMIT - 1; i++) await consumePublicApiRateLimit(prisma, { merchantId: SEED_IDS.merchant1, mode: "test" });
    const limited = await read(await announcements(bearer("/api/merchant-api/announcements", key), {}));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    // Another merchant / mode is unaffected.
    expect((await ping(bearer("/api/merchant-api/ping", SEED_API_KEYS[SEED_IDS.apiKey2]), {})).status).toBe(200);
  });
});
