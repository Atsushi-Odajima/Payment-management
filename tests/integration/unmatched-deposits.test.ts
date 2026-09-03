// Unmatched bank deposits (振込IDの付け忘れ) and API re-notify (API 再通知):
// register (manually or via the bank notification), match by transfer id →
// reconciliation + merchant webhook, dismiss, and re-sending payment.completed
// for completed bank transfers only.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, SEED_TRANSFER_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listDeposits, POST as registerDeposit } from "@/app/api/unmatched-deposits/route";
import { GET as depositDetail } from "@/app/api/unmatched-deposits/[id]/route";
import { POST as matchDeposit } from "@/app/api/unmatched-deposits/[id]/match/route";
import { POST as dismissDeposit } from "@/app/api/unmatched-deposits/[id]/dismiss/route";
import { POST as renotify } from "@/app/api/payments/[id]/renotify/route";
import { POST as depositNotify } from "@/app/api/demo/deposit-notify/route";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let MASTER: Record<string, string> = {};
let GENERAL: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const match = async (id: string, transferId: string, headers: Record<string, string>) => read(await matchDeposit(json(`/api/unmatched-deposits/${id}/match`, "POST", { transferId }, headers), { params: { id } }));
const renotifyReq = async (id: string, headers: Record<string, string>) => read(await renotify(json(`/api/payments/${id}/renotify`, "POST", {}, headers), { params: { id } }));

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
  GENERAL = await sessionHeaders("general");
});

describe("unmatched deposits", () => {
  it("lists the seeded deposits (unmatched first), registers new ones and exports CSV", async () => {
    const list = await read(await listDeposits(new Request(BASE + "/api/unmatched-deposits?mode=test"), {}));
    expect(list.status).toBe(200);
    expect(list.body.data.openCount).toBe(1);
    expect(list.body.data.items[0]).toMatchObject({ id: SEED_IDS.unmatched1, status: "unmatched", source: "bank", amount: 6600 });

    expect((await read(await registerDeposit(json("/api/unmatched-deposits?mode=test", "POST", { amount: 100, payerName: "x" }), {}))).status).toBe(401);
    const bad = await read(await registerDeposit(json("/api/unmatched-deposits?mode=test", "POST", { amount: 0, payerName: "" }, GENERAL), {}));
    expect(bad.status).toBe(400);
    const created = await read(await registerDeposit(json("/api/unmatched-deposits?mode=live", "POST", { amount: 24800, payerName: "TANAKA JIRO", receivedAt: "2026-08-31T01:00:00Z", bankReference: "ref-1", givenTransferId: "4821", note: "" }, GENERAL), {}));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: "unmatched", source: "manual", livemode: true, givenTransferId: "4821" });
    expect(await prisma.auditLog.count({ where: { action: "deposit.register", targetId: created.body.data.id } })).toBe(1);

    const csv = await listDeposits(new Request(BASE + "/api/unmatched-deposits?mode=test&format=csv"), {});
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("und_demo_001");
  });

  it("files a bank notification without a usable transfer id as an unmatched deposit", async () => {
    vi.stubEnv("DEPOSIT_NOTIFY_SECRET", "");
    const res = await read(await depositNotify(json("/api/demo/deposit-notify", "POST", { amount: 6600, payerName: "WATANABE KEN", bankReference: "b-2" }), {}));
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ matched: false, received: 6600 });
    const row = await prisma.unmatchedDeposit.findUniqueOrThrow({ where: { id: res.body.data.unmatchedDepositId } });
    expect(row).toMatchObject({ status: "unmatched", source: "bank", payerName: "WATANABE KEN", bankReference: "b-2", livemode: false });
    vi.unstubAllEnvs();
  });

  it("suggests awaiting transfers with the exact remaining amount first", async () => {
    const res = await read(await depositDetail(new Request(BASE + `/api/unmatched-deposits/${SEED_IDS.unmatched1}`), { params: { id: SEED_IDS.unmatched1 } }));
    expect(res.status).toBe(200);
    const c = res.body.data.candidates as Array<{ transferId: string; exact: boolean; overdue: boolean }>;
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c[0]).toMatchObject({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment5], exact: true, overdue: true });
    expect(c.every((x) => /^\d{7,8}$/.test(x.transferId))).toBe(true);
  });

  it("match by transfer id (master) reconciles the transaction and notifies the merchant's API", async () => {
    const id = SEED_IDS.unmatched1;
    const transferId = SEED_TRANSFER_IDS[SEED_IDS.payment5];
    expect((await match(id, transferId, {})).status).toBe(403);
    expect((await match(id, transferId, GENERAL)).status).toBe(403);
    expect((await match(id, "1234567", MASTER)).status).toBe(404);
    expect((await match(id, "abc", MASTER)).status).toBe(400);
    // A completed transfer cannot be the target.
    const done = await match(id, SEED_TRANSFER_IDS[SEED_IDS.payment7], MASTER);
    expect(done.status).toBe(409);
    expect(done.body.error.code).toBe("invalid_transition");
    // A live-mode transfer does not match a test-mode deposit.
    const live = await match(id, SEED_TRANSFER_IDS[SEED_IDS.payment9], MASTER);
    expect(live.status).toBe(409);
    expect(live.body.error.code).toBe("mode_mismatch");

    const before = await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment5, event: "payment.completed" } });
    const res = await match(id, transferId, MASTER);
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: "captured", depositDiff: null, depositAmount: 6600 });
    expect(res.body.data.renotified).toBe(true);
    expect(res.body.data.deposit).toMatchObject({ status: "matched", matchedTransferId: transferId, payment: { id: SEED_IDS.payment5, orderNumber: "ORD-DEMO-005" } });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment5 } });
    expect(payment.status).toBe("captured");
    // The completion webhook (API notification) was enqueued for the merchant.
    expect(await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment5, event: "payment.completed" } })).toBe(before + 1);
    expect(await prisma.auditLog.count({ where: { action: "deposit.match", targetId: id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "payment.deposit", targetId: SEED_IDS.payment5 } })).toBe(1);
    // Already handled.
    const again = await match(id, transferId, MASTER);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("deposit_not_open");
  });

  it("a short match keeps the transaction awaiting and any admin can dismiss", async () => {
    const created = await read(await registerDeposit(json("/api/unmatched-deposits?mode=test", "POST", { amount: 4000, payerName: "SHORT" }, GENERAL), {}));
    const res = await match(created.body.data.id, SEED_TRANSFER_IDS[SEED_IDS.payment5], MASTER);
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: "awaiting_transfer", depositDiff: "short", depositAmount: 4000 });
    expect(res.body.data.renotified).toBe(false);

    expect((await read(await dismissDeposit(json(`/api/unmatched-deposits/${SEED_IDS.unmatched1}/dismiss`, "POST", { reason: "" }, GENERAL), { params: { id: SEED_IDS.unmatched1 } }))).status).toBe(400);
    const dismissed = await read(await dismissDeposit(json(`/api/unmatched-deposits/${SEED_IDS.unmatched1}/dismiss`, "POST", { reason: "returned to payer" }, GENERAL), { params: { id: SEED_IDS.unmatched1 } }));
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.data).toMatchObject({ status: "dismissed", dismissReason: "returned to payer" });
    expect((await match(SEED_IDS.unmatched1, SEED_TRANSFER_IDS[SEED_IDS.payment5], MASTER)).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: "deposit.dismiss", targetId: SEED_IDS.unmatched1 } })).toBe(1);
  });
});

describe("API re-notify (bank transfers only)", () => {
  it("re-sends payment.completed for a completed bank transfer and refuses everything else", async () => {
    // payment7 is a completed bank transfer of merchant3; payment1 is a completed card payment; payment5 is still awaiting.
    expect((await renotifyReq(SEED_IDS.payment7, {})).status).toBe(403);
    expect((await renotifyReq(SEED_IDS.payment7, GENERAL)).status).toBe(403);
    const card = await renotifyReq(SEED_IDS.payment1, MASTER);
    expect(card.status).toBe(409);
    expect(card.body.error.code).toBe("not_bank_transfer");
    const open = await renotifyReq(SEED_IDS.payment5, MASTER);
    expect(open.status).toBe(409);
    expect(open.body.error.code).toBe("invalid_transition");
    expect((await renotifyReq("nope", MASTER)).status).toBe(404);

    const before = await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment7, event: "payment.completed" } });
    const first = await renotifyReq(SEED_IDS.payment7, MASTER);
    expect(first.status).toBe(200);
    expect(first.body.data.renotifyCount).toBe(1);
    expect(first.body.data.deliveryId).toBeTruthy();
    const second = await renotifyReq(SEED_IDS.payment7, MASTER);
    expect(second.body.data.renotifyCount).toBe(2);
    expect(await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment7, event: "payment.completed" } })).toBe(before + 2);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment7 } });
    expect(payment.renotifyCount).toBe(2);
    expect(payment.renotifiedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "payment.renotify", targetId: SEED_IDS.payment7 } })).toBe(2);
    // The delivery carries the merchant's notification URL and the event.
    const delivery = await prisma.webhookDelivery.findFirst({ where: { id: first.body.data.deliveryId } });
    expect(delivery).toMatchObject({ event: "payment.completed", merchantId: SEED_IDS.merchant3 });
  });
});
