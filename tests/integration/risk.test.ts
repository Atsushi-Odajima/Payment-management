// Phase F: chargebacks (register → dispute → resolve / confirm, settlement
// deduction), blacklist blocking at checkout, repeated-failure detection,
// risk settings and deposit-difference follow-ups.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { GET as listChargebacks, POST as registerChargeback } from "@/app/api/chargebacks/route";
import { POST as chargebackAction } from "@/app/api/chargebacks/[id]/[action]/route";
import { GET as listBlacklist, POST as addBlacklist } from "@/app/api/blacklist/route";
import { PATCH as patchBlacklist } from "@/app/api/blacklist/[id]/route";
import { PUT as putRiskSettings } from "@/app/api/risk-settings/route";
import { GET as listDepositDiffs } from "@/app/api/deposit-diffs/route";
import { POST as depositDiffAction } from "@/app/api/deposit-diffs/[id]/[action]/route";
import { collectLines } from "@/lib/settlements/service";
import { cardFingerprint } from "@/lib/risk/service";
import { searchAll } from "@/lib/search";
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
const CARD = { brand: "visa" as const, last4: "4242", expiry: "12/28" };
async function checkout(extra: Record<string, unknown>, headers: Record<string, string> = {}) {
  return read(
    await createPayment(
      json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: `ORD-${Math.random().toString(36).slice(2, 8)}`, amount: 1200, customerName: "T", customerId: "u_t", ...extra }, headers),
      {},
    ),
  );
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
  GENERAL = await sessionHeaders("general");
});

describe("chargebacks", () => {
  it("registers (master only), disputes, records a loss and deducts it in settlements", async () => {
    expect((await read(await registerChargeback(json("/api/chargebacks", "POST", { paymentId: SEED_IDS.payment1, reasonCode: "fraud" }, GENERAL), {}))).status).toBe(403);
    const notCaptured = await read(await registerChargeback(json("/api/chargebacks", "POST", { paymentId: SEED_IDS.payment3, reasonCode: "fraud" }, MASTER), {}));
    expect(notCaptured.status).toBe(409);
    const created = await read(await registerChargeback(json("/api/chargebacks", "POST", { paymentId: SEED_IDS.payment1, reasonCode: "fraud", disputeDeadline: "2026-09-20" }, MASTER), {}));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: "received", amount: 4980, reasonCode: "fraud" });
    const id = created.body.data.id as string;
    expect((await read(await registerChargeback(json("/api/chargebacks", "POST", { paymentId: SEED_IDS.payment1, reasonCode: "other" }, MASTER), {}))).body.error.code).toBe("chargeback_exists");
    expect(await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment1, event: "chargeback.opened" } })).toBe(1);

    const act = async (action: string, body: unknown, headers = MASTER) => read(await chargebackAction(json(`/api/chargebacks/${id}/${action}`, "POST", body, headers), { params: { id, action } }));
    expect((await act("resolve", { outcome: "lost" })).status).toBe(409); // must be disputed first
    expect((await act("dispute", {})).status).toBe(400); // evidence required
    expect((await act("dispute", { evidenceNote: "tracking #123" })).body.data.status).toBe("disputed");
    const lost = await act("resolve", { outcome: "lost", note: "issuer sided with the cardholder" });
    expect(lost.body.data).toMatchObject({ status: "lost" });
    expect(lost.body.data.resolvedAt).not.toBeNull();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment1 } })).status).toBe("chargeback");
    expect(await prisma.paymentEvent.count({ where: { paymentId: SEED_IDS.payment1, type: "chargeback" } })).toBe(1);

    // Settlement lines of the period deduct the lost chargeback.
    const lines = await collectLines(prisma, { merchantId: SEED_IDS.merchant1, livemode: false, from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) });
    const cbLine = lines.find((l) => l.kind === "chargeback");
    expect(cbLine).toMatchObject({ amount: -4980, chargebackId: id });

    expect((await act("confirm", {})).body.data.status).toBe("confirmed");
    expect(await prisma.auditLog.count({ where: { targetType: "chargeback", targetId: id } })).toBe(4);
    const list = await read(await listChargebacks(new Request(BASE + "/api/chargebacks?mode=test"), {}));
    expect(list.body.data.chargebacks.map((c: any) => c.status)).toEqual(["received", "confirmed"]); // seeded open case first
  });
});

describe("blacklist and repeated-failure detection", () => {
  it("blocks checkouts matching an active entry and files candidates after repeated failures", async () => {
    // Seeded active IP entry blocks the checkout.
    const blocked = await checkout({}, { "x-forwarded-for": "198.51.100.77" });
    expect(blocked.status).toBe(201);
    expect(blocked.body.data).toMatchObject({ status: "failed", failureReason: "blocked:ip" });
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: blocked.body.data.id } });
    expect(stored.clientIp).toBe("198.51.100.77");

    // Manual entry (master) for an email; general is refused.
    expect((await read(await addBlacklist(json("/api/blacklist", "POST", { kind: "email", value: "Bad@Example.com" }, GENERAL), {}))).status).toBe(403);
    const added = await read(await addBlacklist(json("/api/blacklist", "POST", { kind: "email", value: "Bad@Example.com", reason: "fraud ring" }, MASTER), {}));
    expect(added.status).toBe(201);
    expect(added.body.data.value).toBe("bad@example.com");
    expect((await read(await addBlacklist(json("/api/blacklist", "POST", { kind: "email", value: "bad@example.com" }, MASTER), {}))).body.error.code).toBe("blacklist_exists");
    expect((await checkout({ customerEmail: "BAD@example.com" })).body.data.failureReason).toBe("blocked:email");

    // Disabled entries no longer block.
    await patchBlacklist(json(`/api/blacklist/${added.body.data.id}`, "PATCH", { status: "disabled" }, MASTER), { params: { id: added.body.data.id } });
    expect((await checkout({ customerEmail: "bad@example.com" })).body.data.status).toBe("captured");

    // Three failures from the same card within the window → candidate (threshold 3).
    await putRiskSettings(json("/api/risk-settings", "PUT", { windowMinutes: 30, maxFailures: 3 }, MASTER), {});
    const fingerprint = cardFingerprint(CARD);
    for (let i = 0; i < 3; i++) {
      const p = await checkout({ card: CARD, autoCapture: false });
      expect(p.body.data.status).toBe("authorized");
      await paymentAction(json(`/api/payments/${p.body.data.id}/fail`, "POST", undefined, MASTER), { params: { id: p.body.data.id, action: "fail" } });
    }
    const candidate = await prisma.blacklist.findUnique({ where: { kind_value: { kind: "card", value: fingerprint } } });
    expect(candidate).toMatchObject({ status: "candidate", source: "auto" });
    // A candidate does not block yet; approving it does.
    expect((await checkout({ card: CARD })).body.data.status).toBe("captured");
    const approved = await read(await patchBlacklist(json(`/api/blacklist/${candidate!.id}`, "PATCH", { status: "active" }, MASTER), { params: { id: candidate!.id } }));
    expect(approved.body.data.status).toBe("active");
    expect((await checkout({ card: CARD })).body.data.failureReason).toBe("blocked:card");

    const list = await read(await listBlacklist(new Request(BASE + "/api/blacklist"), {}));
    expect(list.body.data.candidateCount).toBe(1); // the seeded candidate remains
    expect(list.body.data.entries[0].status).toBe("candidate");

    // Card last 4 is searchable.
    const hits = await searchAll("4242", { limit: 10, includeAdmins: false });
    expect(hits.payments.length).toBeGreaterThan(0);
    expect(hits.payments[0].cardLast4).toBe("4242");
  });
});

describe("deposit differences", () => {
  it("lists short / excess deposits and drives the follow-up", async () => {
    const list = await read(await listDepositDiffs(new Request(BASE + "/api/deposit-diffs?mode=live"), {}));
    expect(list.body.data.openCount).toBe(2);
    const excess = list.body.data.items.find((i: any) => i.diff === "excess");
    const short = list.body.data.items.find((i: any) => i.diff === "short");
    expect(excess.difference).toBe(500);
    expect(short.difference).toBe(-1000);

    const run = async (id: string, action: string) => read(await depositDiffAction(json(`/api/deposit-diffs/${id}/${action}`, "POST", undefined, GENERAL), { params: { id, action } }));
    expect((await run(short.id, "refund")).status).toBe(409);
    const refunded = await run(excess.id, "refund");
    expect(refunded.body.data.diffStatus).toBe("refund_arranged");
    const request = await prisma.refund.findFirst({ where: { paymentId: excess.id } });
    expect(request).toMatchObject({ status: "requested", amount: 500, reasonCode: "duplicate" });
    expect((await run(short.id, "notify")).body.data.diffStatus).toBe("notified");
    expect((await run(short.id, "resolve")).body.data.diffStatus).toBe("resolved");
    expect((await run(short.id, "resolve")).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: "payment.deposit_diff_update" } })).toBe(3);

    // A new short reconciliation opens a case automatically.
    const res = await read(await paymentAction(json(`/api/payments/${SEED_IDS.payment4}/deposit`, "POST", { amount: 1000 }, MASTER), { params: { id: SEED_IDS.payment4, action: "deposit" } }));
    expect(res.body.data.depositDiff).toBe("short");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment4 } })).depositDiffStatus).toBe("open");
  });
});
