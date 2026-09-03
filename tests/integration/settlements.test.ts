// Settlements (Phase D): batch generation from completed transactions /
// refunds with contract fees, status transitions (master only, hold needs a
// reason), settings, CSV export and the merchant-facing API.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_API_KEYS, SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as generate } from "@/app/api/settlements/generate/route";
import { GET as listSettlements } from "@/app/api/settlements/route";
import { DELETE as discard } from "@/app/api/settlements/[id]/route";
import { POST as act } from "@/app/api/settlements/[id]/[action]/route";
import { GET as lines } from "@/app/api/settlements/[id]/lines/route";
import { PATCH as patchSettings } from "@/app/api/merchants/[id]/settlement/route";
import { GET as merchantApi } from "@/app/api/merchant-api/settlements/route";
import { payoutDate, lastClosedPeriod } from "@/lib/settlements/schedule";
import { summarize } from "@/lib/settlements/service";
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
const run = async (id: string, action: string, headers: Record<string, string>, body?: unknown) =>
  read(await act(json(`/api/settlements/${id}/${action}`, "POST", body, headers), { params: { id, action } }));

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
  GENERAL = await sessionHeaders("general");
});

describe("settlement helpers", () => {
  it("computes payout dates in the business time zone", () => {
    const end = new Date("2026-08-31T00:00:00+09:00");
    expect(payoutDate(end, "next_month_end").toISOString()).toBe(new Date("2026-09-30T00:00:00+09:00").toISOString());
    expect(payoutDate(end, "next_month_15").toISOString()).toBe(new Date("2026-09-15T00:00:00+09:00").toISOString());
    expect(payoutDate(end, "month_after_next_15").toISOString()).toBe(new Date("2026-10-15T00:00:00+09:00").toISOString());
    expect(payoutDate(end, "next_week").toISOString()).toBe(new Date("2026-09-07T00:00:00+09:00").toISOString());
    expect(lastClosedPeriod("monthly", new Date("2026-09-03T00:00:00+09:00"))).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(lastClosedPeriod("semimonthly", new Date("2026-09-20T00:00:00+09:00"))).toEqual({ from: "2026-09-01", to: "2026-09-15" });
    expect(lastClosedPeriod("weekly", new Date("2026-09-03T00:00:00+09:00"))).toEqual({ from: "2026-08-24", to: "2026-08-30" });
  });

  it("sums lines into the batch totals", () => {
    const totals = summarize(
      [
        { kind: "payment", amount: 10_000, fee: 360, method: "credit", description: null, occurredAt: NOW },
        { kind: "refund", amount: -1_000, fee: 0, method: "credit", description: null, occurredAt: NOW },
        { kind: "chargeback", amount: -2_000, fee: 0, method: "credit", description: null, occurredAt: NOW },
      ],
      330,
    );
    expect(totals).toEqual({ grossAmount: 10_000, feeAmount: 360, refundAmount: 1_000, chargebackAmount: 2_000, settlementFee: 330, netAmount: 6_310 });
  });
});

describe("settlement batches", () => {
  it("generates a batch from completed transactions with contract fees and refuses duplicates", async () => {
    // Seed (NOW = 2026-09-01 12:00 JST): payment1 (4,980 credit, 3.6% standard → 179),
    // payment2 (1,280 qr → 38) and payment7 (12,000 bank, merchant3) completed within the last day.
    const res = await read(await generate(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant1, from: "2026-08-25", to: "2026-09-01" }, MASTER), {}));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "collecting", grossAmount: 6_260, feeAmount: 217, refundAmount: 0, settlementFee: 330, netAmount: 5_713, livemode: false });
    expect(res.body.data._count.lines).toBe(2);
    expect(new Date(res.body.data.scheduledAt).toISOString()).toBe(new Date("2026-10-31T00:00:00+09:00").toISOString());
    expect(await prisma.auditLog.count({ where: { action: "settlement.generate", targetId: res.body.data.id } })).toBe(1);

    const dup = await read(await generate(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant1, from: "2026-08-25", to: "2026-09-01" }, MASTER), {}));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("settlement_exists");

    const csv = await lines(new Request(`${BASE}/api/settlements/${res.body.data.id}/lines?format=csv`, { headers: MASTER }), { params: { id: res.body.data.id } });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect((await csv.text()).split("\r\n").filter(Boolean)).toHaveLength(3);

    const unauth = await read(await generate(json("/api/settlements/generate", "POST", { merchantId: SEED_IDS.merchant1, from: "2026-08-01", to: "2026-08-31" }), {}));
    expect(unauth.status).toBe(401);
  });

  it("deducts completed refunds and walks the status machine (master only)", async () => {
    await prisma.refund.update({ where: { id: SEED_IDS.refund1 }, data: { status: "completed", completedAt: new Date("2026-08-31T00:00:00Z") } });
    const res = await read(await generate(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant1, from: "2026-08-25", to: "2026-09-01" }, MASTER), {}));
    expect(res.body.data).toMatchObject({ refundAmount: 500, netAmount: 5_213 });
    const id = res.body.data.id as string;

    expect((await run(id, "confirm", GENERAL)).status).toBe(403);
    expect((await run(id, "pay", MASTER)).status).toBe(409);
    expect((await run(id, "confirm", MASTER)).body.data.status).toBe("confirmed");
    const hold = await run(id, "hold", MASTER, {});
    expect(hold.status).toBe(400);
    expect((await run(id, "hold", MASTER, { reason: "dispute" })).body.data).toMatchObject({ status: "held", holdReason: "dispute" });
    expect((await run(id, "release", MASTER)).body.data).toMatchObject({ status: "confirmed", holdReason: null });
    expect((await run(id, "schedule", MASTER)).body.data.status).toBe("scheduled");
    const paid = await run(id, "pay", MASTER);
    expect(paid.body.data.status).toBe("paid");
    expect(paid.body.data.paidAt).not.toBeNull();
    // generate + confirm + hold + release + schedule + pay (the rejected hold is not audited)
    expect(await prisma.auditLog.count({ where: { targetType: "settlement", targetId: id } })).toBe(6);
    // A paid batch cannot be discarded; a collecting one can.
    expect((await read(await discard(json(`/api/settlements/${id}`, "DELETE", undefined, MASTER), { params: { id } }))).status).toBe(409);
    const fresh = await read(await generate(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant2, from: "2026-08-01", to: "2026-08-31" }, MASTER), {}));
    expect((await read(await discard(json(`/api/settlements/${fresh.body.data.id}`, "DELETE", undefined, MASTER), { params: { id: fresh.body.data.id } }))).status).toBe(200);
  });

  it("lists batches for the mode and exports CSV", async () => {
    const list = await read(await listSettlements(new Request(BASE + "/api/settlements?mode=test"), {}));
    expect(list.body.data.settlements.map((s: any) => s.status).sort()).toEqual(["confirmed", "paid"]); // seeded
    expect((await read(await listSettlements(new Request(BASE + "/api/settlements?mode=live"), {}))).body.data.total).toBe(0);
    const csv = await listSettlements(new Request(BASE + "/api/settlements?mode=test&format=csv", { headers: MASTER }), {});
    expect((await csv.text()).split("\r\n").filter(Boolean)).toHaveLength(3);
  });

  it("stores settlement settings and audits them", async () => {
    const bad = await read(await patchSettings(json(`/api/merchants/${SEED_IDS.merchant2}/settlement`, "PATCH", { settlementCycle: "weekly", payoutTerm: "next_week", bankAccountNumber: "12" }, MASTER), { params: { id: SEED_IDS.merchant2 } }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fieldErrors.bankAccountNumber).toBe("digits");
    const ok = await read(
      await patchSettings(
        json(`/api/merchants/${SEED_IDS.merchant2}/settlement`, "PATCH", { settlementCycle: "weekly", payoutTerm: "next_week", bankName: "B", bankBranch: "", bankAccountType: "current", bankAccountNumber: "7654321", bankAccountHolder: "H", settlementFee: 220 }, MASTER),
        { params: { id: SEED_IDS.merchant2 } },
      ),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ settlementCycle: "weekly", payoutTerm: "next_week", bankBranch: null, bankAccountType: "current", settlementFee: 220 });
    expect(await prisma.auditLog.count({ where: { action: "merchant.settlement_update", targetId: SEED_IDS.merchant2 } })).toBe(1);
  });

  it("serves a merchant its own batches through the merchant API", async () => {
    const bearer = (q = "") => new Request(`${BASE}/api/merchant-api/settlements${q}`, { headers: { authorization: `Bearer ${SEED_API_KEYS[SEED_IDS.apiKey1]}` } });
    const own = await read(await merchantApi(bearer(), {}));
    expect(own.status).toBe(200);
    expect(own.body.data.merchantCode).toBe("MER-00001");
    expect(own.body.data.settlements.map((s: any) => s.id)).toEqual([SEED_IDS.settlement1]);
    const detail = await read(await merchantApi(bearer(`?id=${SEED_IDS.settlement1}`), {}));
    expect(detail.body.data.lines).toHaveLength(4);
    // Another merchant's batch is invisible.
    expect((await read(await merchantApi(bearer(`?id=${SEED_IDS.settlement2}`), {}))).status).toBe(404);
    expect((await read(await merchantApi(new Request(`${BASE}/api/merchant-api/settlements`), {}))).status).toBe(401);
  });
});
