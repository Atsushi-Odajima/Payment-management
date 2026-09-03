// Refund requests (Phase C): request validation (balance, pending reservations,
// refund window), master-only approval / rejection, and the effect on the payment.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listRefunds, POST as requestRefund } from "@/app/api/refunds/route";
import { POST as approve } from "@/app/api/refunds/[id]/approve/route";
import { POST as reject } from "@/app/api/refunds/[id]/reject/route";
import { loadTransactionDetail } from "@/lib/payments/detail";
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
const request = async (body: unknown, headers: Record<string, string>) => read(await requestRefund(json("/api/refunds", "POST", body, headers), {}));
const decide = async (fn: typeof approve, id: string, headers: Record<string, string>, note = "") =>
  read(await fn(json(`/api/refunds/${id}/approve`, "POST", { note }, headers), { params: { id } }));

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
  GENERAL = await sessionHeaders("general");
});

describe("refund requests", () => {
  it("requires a session and validates the amount and reason", async () => {
    expect((await request({ paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "customer" }, {})).status).toBe(401);
    const tooMuch = await request({ paymentId: SEED_IDS.payment1, amount: 5000, reasonCode: "customer" }, GENERAL);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.code).toBe("refund_exceeds");
    const otherNoText = await request({ paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "other" }, GENERAL);
    expect(otherNoText.status).toBe(400);
    const notCaptured = await request({ paymentId: SEED_IDS.payment3, amount: 100, reasonCode: "customer" }, GENERAL);
    expect(notCaptured.status).toBe(409);
  });

  it("reserves pending amounts and lets a master approve or reject", async () => {
    const first = await request({ paymentId: SEED_IDS.payment1, amount: 3000, reasonCode: "defect", reason: "torn" }, GENERAL);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ status: "requested", kind: "partial", forced: false });
    // 4980 − 3000 pending → only 1980 left for further requests.
    expect((await request({ paymentId: SEED_IDS.payment1, amount: 2000, reasonCode: "customer" }, GENERAL)).body.error.code).toBe("refund_exceeds");
    const detail = await loadTransactionDetail(SEED_IDS.payment1);
    expect(detail?.pendingRefundAmount).toBe(3000);

    // General cannot decide.
    expect((await decide(approve, first.body.data.id, GENERAL)).status).toBe(403);

    const approved = await decide(approve, first.body.data.id, MASTER, "ok");
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ status: "completed", decisionNote: "ok" });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment1 } });
    expect(payment.status).toBe("partially_refunded");
    expect(payment.amountRefunded).toBe(3000);
    expect(await prisma.paymentEvent.count({ where: { paymentId: SEED_IDS.payment1, type: "refund" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: { in: ["refund.request", "refund.approve", "payment.refund"] }, targetId: { in: [first.body.data.id, SEED_IDS.payment1] } } })).toBe(3);
    // Deciding twice is refused.
    expect((await decide(approve, first.body.data.id, MASTER)).status).toBe(409);

    const second = await request({ paymentId: SEED_IDS.payment1, amount: 1980, reasonCode: "customer" }, GENERAL);
    expect(second.body.data.kind).toBe("partial");
    const rejected = await read(await reject(json(`/api/refunds/${second.body.data.id}/reject`, "POST", { note: "no" }, MASTER), { params: { id: second.body.data.id } }));
    expect(rejected.status).toBe(200);
    expect(rejected.body.data).toMatchObject({ status: "rejected", decisionNote: "no" });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment1 } })).amountRefunded).toBe(3000);
  });

  it("enforces the refund window unless a master forces it with a reason", async () => {
    await prisma.merchant.update({ where: { id: SEED_IDS.merchant1 }, data: { refundWindowDays: 0 } });
    const general = await request({ paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "customer" }, GENERAL);
    expect(general.status).toBe(409);
    expect(general.body.error.code).toBe("refund_window_expired");
    const masterNoForce = await request({ paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "customer" }, MASTER);
    expect(masterNoForce.status).toBe(409);
    const masterNoReason = await request({ paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "customer", force: true }, MASTER);
    expect(masterNoReason.status).toBe(400);
    const forced = await request({ paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "customer", reason: "goodwill", force: true }, MASTER);
    expect(forced.status).toBe(201);
    expect(forced.body.data.forced).toBe(true);
  });

  it("lists requested rows first and exports CSV", async () => {
    const list = await read(await listRefunds(new Request(BASE + "/api/refunds"), {}));
    expect(list.status).toBe(200);
    expect(list.body.data.refunds[0].status).toBe("requested"); // seeded pending request
    expect(list.body.data.pendingCount).toBe(1);
    const csv = await listRefunds(new Request(BASE + "/api/refunds?format=csv&status=rejected"), {});
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(text).toContain("rejected");
  });
});
