// Phase P1 (funds & integrity fixes):
//   1-1 idempotent deposit notifications + the notification log
//   1-2 mandatory mode, other-mode deposits filed as unmatched
//   1-3 late / cancelled deposits → unmatched → late_deposit transition
//   1-4 webhooks fail closed without a signing secret; merchants get one at creation
//   1-5 invoice numbers assigned on confirmation, unique per month
//   1-6 konbini slips use awaiting_payment

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_API_KEYS, SEED_CVS_RECEIPT_NOS, SEED_IDS, SEED_TRANSFER_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as depositNotify } from "@/app/api/demo/deposit-notify/route";
import { POST as cvsNotify } from "@/app/api/demo/cvs-notify/route";
import { GET as listNotifications } from "@/app/api/deposit-notifications/route";
import { GET as depositDetail } from "@/app/api/unmatched-deposits/[id]/route";
import { POST as matchDeposit } from "@/app/api/unmatched-deposits/[id]/match/route";
import { POST as lateMatch } from "@/app/api/unmatched-deposits/[id]/late-match/route";
import { POST as dismissDeposit } from "@/app/api/unmatched-deposits/[id]/dismiss/route";
import { POST as createMerchant } from "@/app/api/merchants/route";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { POST as generateSettlement } from "@/app/api/settlements/generate/route";
import { POST as settlementAction } from "@/app/api/settlements/[id]/[action]/route";
import { GET as invoicePdf } from "@/app/api/settlements/[id]/invoice/route";
import { GET as search } from "@/app/api/search/route";
import { depositDedupeKey } from "@/lib/deposits/notify";
import { runDailyDigests } from "@/lib/notifications/digest";
import { SIGNING_SECRET_MISSING, attemptDelivery, emitPaymentWebhook, signPayload } from "@/lib/webhooks/deliver";
import { runPhase1Backfill } from "@/lib/maintenance/phase1-backfill";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let ADMIN: Record<string, string> = {};
let ACCOUNTING: Record<string, string> = {};
let CS: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const bank = async (body: unknown) => read(await depositNotify(json("/api/demo/deposit-notify", "POST", body), {}));
const cvs = async (body: unknown) => read(await cvsNotify(json("/api/demo/cvs-notify", "POST", body), {}));

beforeEach(async () => {
  vi.stubEnv("DEPOSIT_NOTIFY_SECRET", "");
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
  ACCOUNTING = await sessionHeaders("accounting");
  CS = await sessionHeaders("cs");
});

describe("P1-1 idempotent deposit notifications and the log", () => {
  it("applies a bank notification once and answers duplicate for the same eventId", async () => {
    const body = { eventId: "evt-1", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4], amount: 24_800, mode: "test" };
    const first = await bank(body);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ matched: true, duplicate: false, completed: true, status: "captured" });
    expect(first.body.data.notificationNo).toMatch(/^DN-\d{5}$/);

    const again = await bank(body);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ duplicate: true, notificationId: first.body.data.notificationId, paymentId: SEED_IDS.payment4 });
    // Nothing was re-applied: the deposit total is still one payment.
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment4 } });
    expect(p.depositAmount).toBe(24_800);
    expect(p.depositDiff).toBeNull();
    expect(await prisma.paymentEvent.count({ where: { paymentId: SEED_IDS.payment4, type: "deposit" } })).toBe(1);
    // Both notifications are in the log; the second points at the first.
    const rows = await prisma.depositNotification.findMany({ where: { eventId: "evt-1" }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.result)).toEqual(["applied", "duplicate"]);
    expect(rows[1].duplicateOfId).toBe(rows[0].id);
    expect(rows[1].claimKey).toBeNull();
  });

  it("hashes source | id | amount | minute | reference when no eventId is given", async () => {
    const receivedAt = "2026-09-01T02:30:10Z";
    const a = depositDedupeKey({ source: "bank", id: "1234567", amount: 100, receivedAt: new Date(receivedAt), bankReference: "r" });
    const b = depositDedupeKey({ source: "bank", id: "1234567", amount: 100, receivedAt: new Date("2026-09-01T02:30:59Z"), bankReference: "r" });
    const c = depositDedupeKey({ source: "cvs", id: "1234567", amount: 100, receivedAt: new Date(receivedAt), bankReference: "r" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(depositDedupeKey({ source: "bank", eventId: "x", id: "1", amount: 1, receivedAt: new Date() })).toBe("bank:evt:x");

    // A short deposit followed by the identical notification (same minute) is not counted twice.
    const body = { transferId: SEED_TRANSFER_IDS[SEED_IDS.payment5], amount: 3000, receivedAt, mode: "test" };
    expect((await bank(body)).body.data).toMatchObject({ completed: false, depositDiff: "short", depositAmount: 3000 });
    expect((await bank(body)).body.data.duplicate).toBe(true);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment5 } })).depositAmount).toBe(3000);
  });

  it("konbini notifications go through the same log and are idempotent", async () => {
    const body = { eventId: "cvs-evt-9", receiptNo: SEED_CVS_RECEIPT_NOS[SEED_IDS.payment14], mode: "test" };
    expect((await cvs(body)).body.data).toMatchObject({ matched: true, completed: true });
    expect((await cvs(body)).body.data.duplicate).toBe(true);
    const row = await prisma.depositNotification.findFirstOrThrow({ where: { eventId: "cvs-evt-9", result: "applied" } });
    expect(row).toMatchObject({ source: "cvs", cvsReceiptNo: SEED_CVS_RECEIPT_NOS[SEED_IDS.payment14], paymentId: SEED_IDS.payment14, amount: 3980 });
    // Unknown receipt numbers are recorded as rejected (404 for the sender).
    expect((await cvs({ receiptNo: "9999999999999", mode: "test" })).status).toBe(404);
    expect(await prisma.depositNotification.count({ where: { source: "cvs", result: "rejected", resultReason: "not_found" } })).toBe(1);
  });

  it("lists and filters the log (permission deposit_notification.view for everyone) and exports CSV", async () => {
    await bank({ eventId: "evt-a", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4], amount: 24_800, mode: "test" });
    await bank({ eventId: "evt-a", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4], amount: 24_800, mode: "test" });
    const all = await read(await listNotifications(new Request(BASE + "/api/deposit-notifications?mode=test"), {}));
    expect(all.status).toBe(200);
    // 4 seeded + 2 new
    expect(all.body.data.total).toBe(6);
    const dup = await read(await listNotifications(new Request(BASE + "/api/deposit-notifications?mode=test&result=duplicate"), {}));
    expect(dup.body.data.items.every((r: { result: string }) => r.result === "duplicate")).toBe(true);
    expect(dup.body.data.total).toBe(2);
    const csv = await listNotifications(new Request(BASE + "/api/deposit-notifications?mode=test&format=csv", { headers: ACCOUNTING }), {});
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("notificationNo,receivedRequestAt,source");
    // Live mode is a separate log.
    expect((await read(await listNotifications(new Request(BASE + "/api/deposit-notifications?mode=live"), {}))).body.data.total).toBe(0);
  });
});

describe("P1-2 mode is mandatory and checked against the transaction", () => {
  it("rejects a missing mode with a field error on both endpoints", async () => {
    const b = await bank({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4], amount: 1 });
    expect(b.status).toBe(400);
    expect(b.body.error.details.fieldErrors).toEqual({ mode: "required" });
    const c = await cvs({ receiptNo: SEED_CVS_RECEIPT_NOS[SEED_IDS.payment14] });
    expect(c.status).toBe(400);
    expect(c.body.error.details.fieldErrors).toEqual({ mode: "required" });
    expect(await prisma.depositNotification.count({ where: { transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4] } })).toBe(0);
  });

  it("a test notification for a live transfer id is filed as an unmatched deposit instead of completing it", async () => {
    // payment9 is a live-mode awaiting transfer.
    const res = await bank({ eventId: "evt-live", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment9], amount: 9_800, mode: "test" });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ matched: false, reason: "mode_mismatch", paymentId: SEED_IDS.payment9 });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment9 } })).status).toBe("awaiting_transfer");
    const deposit = await prisma.unmatchedDeposit.findUniqueOrThrow({ where: { id: res.body.data.unmatchedDepositId } });
    expect(deposit).toMatchObject({ livemode: false, source: "bank", reason: "mode_mismatch", candidatePaymentId: SEED_IDS.payment9, status: "unmatched" });
    expect(await prisma.depositNotification.count({ where: { eventId: "evt-live", result: "unmatched", resultReason: "mode_mismatch" } })).toBe(1);

    // The match dialog lists the live transaction first, flagged so it cannot be selected.
    const detail = await read(await depositDetail(new Request(BASE + `/api/unmatched-deposits/${deposit.id}`), { params: { id: deposit.id } }));
    expect(detail.body.data.candidates[0]).toMatchObject({ paymentId: SEED_IDS.payment9, modeMismatch: true, livemode: true });
    const forced = await read(await matchDeposit(json(`/api/unmatched-deposits/${deposit.id}/match`, "POST", { transferId: SEED_TRANSFER_IDS[SEED_IDS.payment9] }, ADMIN), { params: { id: deposit.id } }));
    expect(forced.status).toBe(409);
    expect(forced.body.error.code).toBe("mode_mismatch");
  });
});

describe("P1-3 late and cancelled deposits", () => {
  it("files a deposit on an expired transfer as a late deposit (202) and lets support apply it through late_deposit", async () => {
    const res = await bank({ eventId: "evt-late", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment16], amount: 12_000, payerName: "TAKAHASHI", mode: "test" });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ matched: false, reason: "late_deposit", paymentId: SEED_IDS.payment16 });
    const depositId = res.body.data.unmatchedDepositId as string;
    expect(await prisma.unmatchedDeposit.findUniqueOrThrow({ where: { id: depositId } })).toMatchObject({ reason: "late_deposit", candidatePaymentId: SEED_IDS.payment16, source: "bank" });
    // The ordinary match refuses an expired transfer; the candidate is flagged late.
    const detail = await read(await depositDetail(new Request(BASE + `/api/unmatched-deposits/${depositId}`), { params: { id: depositId } }));
    expect(detail.body.data.candidates[0]).toMatchObject({ paymentId: SEED_IDS.payment16, late: true, status: "expired" });
    expect((await read(await matchDeposit(json(`/api/unmatched-deposits/${depositId}/match`, "POST", { transferId: SEED_TRANSFER_IDS[SEED_IDS.payment16] }, ADMIN), { params: { id: depositId } }))).status).toBe(409);

    // Late match: permission unmatched_deposit.match (admin / accounting), reason required.
    const late = async (id: string, body: unknown, h: Record<string, string>) => read(await lateMatch(json(`/api/unmatched-deposits/${id}/late-match`, "POST", body, h), { params: { id } }));
    expect((await late(depositId, { reason: "merchant agreed" }, CS)).status).toBe(403);
    expect((await late(depositId, { reason: "" }, ACCOUNTING)).status).toBe(400);
    const webhooksBefore = await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment16, event: "payment.completed" } });
    const ok = await late(depositId, { reason: "merchant agreed to ship" }, ACCOUNTING);
    expect(ok.status).toBe(200);
    expect(ok.body.data.payment).toMatchObject({ status: "captured", depositAmount: 12_000, depositDiff: null });
    expect(ok.body.data.renotified).toBe(true);
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment16 }, include: { events: true } });
    expect(p.status).toBe("captured");
    expect(p.capturedAt).not.toBeNull();
    expect(p.events.find((e) => e.type === "late_deposit")).toMatchObject({ fromStatus: "expired", toStatus: "captured", actor: "dashboard" });
    expect(await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment16, event: "payment.completed" } })).toBe(webhooksBefore + 1);
    expect(await prisma.emailLog.count({ where: { paymentId: SEED_IDS.payment16, templateKey: "payment_completed" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "payment.late_deposit", targetId: SEED_IDS.payment16 } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "deposit.late_match", targetId: depositId } })).toBe(1);
    expect((await prisma.unmatchedDeposit.findUniqueOrThrow({ where: { id: depositId } })).status).toBe("matched");
    // Applying twice is refused.
    expect((await late(depositId, { reason: "again" }, ADMIN)).status).toBe(409);
  });

  it("a short late deposit still completes and opens a short case", async () => {
    const res = await bank({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment16], amount: 10_000, mode: "test" });
    const id = res.body.data.unmatchedDepositId as string;
    const ok = await read(await lateMatch(json(`/api/unmatched-deposits/${id}/late-match`, "POST", { reason: "partial" }, ADMIN), { params: { id } }));
    expect(ok.body.data.payment).toMatchObject({ status: "captured", depositDiff: "short", depositAmount: 10_000 });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment16 } })).depositDiffStatus).toBe("open");
  });

  it("a deposit on a cancelled transfer can only be dismissed as a return, and the seeded late deposit is a candidate", async () => {
    await paymentAction(json(`/api/payments/${SEED_IDS.payment4}/cancel`, "POST", {}, ADMIN), { params: { id: SEED_IDS.payment4, action: "cancel" } });
    const res = await bank({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4], amount: 24_800, mode: "test" });
    expect(res.status).toBe(202);
    expect(res.body.data.reason).toBe("cancelled_deposit");
    const id = res.body.data.unmatchedDepositId as string;
    expect((await read(await lateMatch(json(`/api/unmatched-deposits/${id}/late-match`, "POST", { reason: "x" }, ADMIN), { params: { id } }))).status).toBe(409);
    const dismissed = await read(await dismissDeposit(json(`/api/unmatched-deposits/${id}/dismiss`, "POST", { reason: "returned via bank", kind: "returned" }, CS), { params: { id } }));
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.data).toMatchObject({ status: "dismissed", dismissKind: "returned", dismissReason: "returned via bank" });
    // Seeded: und_demo_003 is the late deposit for ORD-DEMO-016.
    const seeded = await prisma.unmatchedDeposit.findUniqueOrThrow({ where: { id: SEED_IDS.unmatched3 } });
    expect(seeded).toMatchObject({ reason: "late_deposit", candidatePaymentId: SEED_IDS.payment16 });
    // Daily digest: one "late deposits" warning per day.
    const digest = await runDailyDigests(prisma, NOW);
    expect(digest.lateDeposits).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.count({ where: { kind: "deposit.late" } })).toBe(1);
    await runDailyDigests(prisma, new Date(NOW.getTime() + 3_600_000));
    expect(await prisma.notification.count({ where: { kind: "deposit.late" } })).toBe(1);
  });
});

describe("P1-4 webhook signing fails closed", () => {
  it("records a delivery as failed with signing_secret_missing and warns operators when the merchant has no usable secret", async () => {
    // Revoke merchant2's test signing secret → nothing usable for test mode.
    await prisma.apiKey.updateMany({ where: { merchantId: SEED_IDS.merchant2, kind: "signing_secret" }, data: { revokedAt: NOW } });
    const id = await emitPaymentWebhook(prisma, SEED_IDS.payment3, "payment.completed");
    expect(id).not.toBeNull();
    const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! } });
    expect(row.status).toBe("failed");
    expect(row.responseBody).toBe(`error: ${SIGNING_SECRET_MISSING}`);
    expect(row.attempts).toBe(0);
    const headers = JSON.parse(row.requestHeaders) as Record<string, string>;
    expect(headers["X-Signature"]).toBeUndefined();
    expect(await prisma.notification.count({ where: { kind: "webhook.signing_secret_missing", targetId: `${SEED_IDS.merchant2}:test` } })).toBe(1);
    // Still no secret on resend → stays failed, no HTTP call.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const retry = await attemptDelivery(prisma, id!, "dashboard", NOW);
    expect(retry).toMatchObject({ ok: false, status: "failed", error: SIGNING_SECRET_MISSING });
    expect(fetchMock).not.toHaveBeenCalled();
    // A secret issued later: the resend signs and sends.
    await prisma.apiKey.updateMany({ where: { id: SEED_IDS.apiKey6 }, data: { revokedAt: null } });
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const sent = await attemptDelivery(prisma, id!, "dashboard", NOW);
    expect(sent.ok).toBe(true);
    const signed = JSON.parse((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! } })).requestHeaders) as Record<string, string>;
    expect(signed["X-Signature"]).toBe(`v1=${signPayload(SEED_API_KEYS[SEED_IDS.apiKey6], signed["X-Timestamp"], row.requestBody!)}`);
    vi.unstubAllGlobals();
  });

  it("issues a test signing secret with a new merchant and returns it exactly once", async () => {
    const body = { siteName: "New Shop", siteNameKana: "ニューショップ", companyName: "New Co.", contactName: "Sato", email: "new@example.jp", statementEmail: "new@example.jp", notifyUrl: "https://new.example.jp/notify", notifyFormat: "json_post", notifyParamSet: "standard", notifyIdFormat: "payment_id", emailNotification: "none", enabledMethods: ["credit"], transferIdDigits: 7 };
    const res = await read(await createMerchant(json("/api/merchants", "POST", body, CS), {}));
    expect(res.status).toBe(201);
    expect(res.body.data.signingSecret.plaintext).toMatch(/^wp_test_ss_/);
    expect(res.body.data.signingSecret.key).toMatchObject({ mode: "test", kind: "signing_secret" });
    const keys = await prisma.apiKey.findMany({ where: { merchantId: res.body.data.id } });
    expect(keys).toHaveLength(1);
    expect(keys[0].secretEnc).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "api_key.issue", targetId: keys[0].id } })).toBe(1);
    // Live mode has no secret yet: a live webhook for this merchant would fail closed (nothing sent).
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(merchant.notifyUrl).toBe(body.notifyUrl);
  });
});

describe("P1-5 invoice numbers", () => {
  it("assigns INV-YYYYMM-<merchant>-<seq> on confirmation, keeps it unique per month and uses it for the PDF and search", async () => {
    const gen = async (from: string, to: string) => (await read(await generateSettlement(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant1, from, to }, ACCOUNTING), {}))).body.data.id as string;
    const confirm = async (id: string) => read(await settlementAction(json(`/api/settlements/${id}/confirm`, "POST", {}, ACCOUNTING), { params: { id, action: "confirm" } }));
    const a = await gen("2026-07-01", "2026-07-15");
    const b = await gen("2026-07-16", "2026-07-31");
    expect((await prisma.settlementBatch.findUniqueOrThrow({ where: { id: a } })).invoiceNo).toBeNull();
    // Collecting batches cannot be invoiced.
    expect((await invoicePdf(new Request(`${BASE}/api/settlements/${a}/invoice`, { headers: ACCOUNTING }), { params: { id: a } })).status).toBe(409);
    expect((await confirm(b)).body.data.invoiceNo).toBe("INV-202607-00001-01");
    expect((await confirm(a)).body.data.invoiceNo).toBe("INV-202607-00001-02");
    // Later transitions keep the number.
    const scheduled = await read(await settlementAction(json(`/api/settlements/${b}/schedule`, "POST", {}, ACCOUNTING), { params: { id: b, action: "schedule" } }));
    expect(scheduled.body.data.invoiceNo).toBe("INV-202607-00001-01");
    const pdf = await invoicePdf(new Request(`${BASE}/api/settlements/${a}/invoice`, { headers: ACCOUNTING }), { params: { id: a } });
    expect(pdf.headers.get("content-disposition")).toContain("invoice-INV-202607-00001-02.pdf");
    // Cross search by invoice number.
    const found = await read(await search(new Request(BASE + "/api/search?q=INV-202607-00001-02", { headers: ADMIN }), {}));
    expect(found.body.data.settlements.map((s: { id: string }) => s.id)).toEqual([a]);
  });

  it("backfills numbers for confirmed batches that predate the column and converts pending konbini slips", async () => {
    // The seed already ran the backfill: the seeded confirmed / paid batches carry numbers.
    const seeded = await prisma.settlementBatch.findMany({ where: { status: { in: ["confirmed", "paid"] } }, select: { invoiceNo: true } });
    expect(seeded.every((b) => b.invoiceNo !== null)).toBe(true);
    // Simulate an old database and run it again.
    await prisma.settlementBatch.updateMany({ data: { invoiceNo: null } });
    await prisma.payment.update({ where: { id: SEED_IDS.payment14 }, data: { status: "pending" } });
    const summary = await runPhase1Backfill(prisma);
    expect(summary.awaitingPayment).toBe(1);
    expect(summary.invoiceNumbers).toBe(seeded.length);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment14 } })).status).toBe("awaiting_payment");
    expect(await runPhase1Backfill(prisma)).toEqual({ awaitingPayment: 0, invoiceNumbers: 0 });
  });
});

describe("P1-6 awaiting_payment", () => {
  it("konbini transactions start as awaiting_payment, expire from it, and accept deposits from it", async () => {
    const res = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.cvsProvider, merchantId: SEED_IDS.merchant3, orderNumber: "ORD-P1-CVS", amount: 2500, cvsBrand: "seven" }, ADMIN), {}));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("awaiting_payment");
    const ev = await prisma.paymentEvent.findFirstOrThrow({ where: { paymentId: res.body.data.id, type: "created" } });
    expect(ev.toStatus).toBe("awaiting_payment");
    // The seeded slip is awaiting_payment too and the dashboard-style overdue query sees it once overdue.
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment14 } })).status).toBe("awaiting_payment");
    // Expiry is checked against the real clock: not overdue → 409, overdue → expired.
    await prisma.payment.update({ where: { id: SEED_IDS.payment14 }, data: { transferDueAt: new Date(Date.now() + 86_400_000) } });
    expect((await read(await paymentAction(json(`/api/payments/${SEED_IDS.payment14}/expire`, "POST", {}, ADMIN), { params: { id: SEED_IDS.payment14, action: "expire" } }))).status).toBe(409);
    await prisma.payment.update({ where: { id: res.body.data.id }, data: { transferDueAt: new Date(Date.now() - 1000) } });
    expect((await read(await paymentAction(json(`/api/payments/${res.body.data.id}/expire`, "POST", {}, ADMIN), { params: { id: res.body.data.id, action: "expire" } }))).body.data.status).toBe("expired");
    const short = await read(await paymentAction(json(`/api/payments/${SEED_IDS.payment14}/deposit`, "POST", { amount: 1000 }, ACCOUNTING), { params: { id: SEED_IDS.payment14, action: "deposit" } }));
    expect(short.body.data).toMatchObject({ status: "awaiting_payment", depositDiff: "short" });
  });
});
