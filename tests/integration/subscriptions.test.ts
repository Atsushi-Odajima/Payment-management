// Phase H: billing plans, subscriptions (charge success / failure → past_due →
// suspended, cron, pause / resume / cancel), payment links (issue, hosted
// checkout, demo completion, disable, expiry) and agent referral fees.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, SEED_PAYMENT_LINK_TOKEN, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listPlans, POST as createPlanRoute } from "@/app/api/plans/route";
import { PATCH as patchPlan } from "@/app/api/plans/[id]/route";
import { GET as listSubscriptions, POST as createSubscriptionRoute } from "@/app/api/subscriptions/route";
import { POST as subscriptionAction } from "@/app/api/subscriptions/[id]/[action]/route";
import { PUT as putDemoSettings } from "@/app/api/subscriptions/demo-settings/route";
import { GET as cron } from "@/app/api/cron/subscriptions/route";
import { GET as listLinks, POST as createLinkRoute } from "@/app/api/payment-links/route";
import { POST as disableLink } from "@/app/api/payment-links/[id]/disable/route";
import { GET as publicLink, POST as checkout } from "@/app/api/pay/[token]/route";
import { POST as completeCheckout } from "@/app/api/pay/[token]/complete/route";
import { GET as agentFeesRoute } from "@/app/api/agent-fees/route";
import { chargeSubscription, processDueSubscriptions } from "@/lib/subscriptions/service";
import { addInterval } from "@/lib/subscriptions/types";
import { agentFee } from "@/lib/agent-fees/service";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
let ACCOUNTING: Record<string, string> = {};
const NOW = new Date("2026-09-01T03:00:00Z");
let MASTER: Record<string, string> = {};
let GENERAL: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const act = async (id: string, action: string, headers: Record<string, string>, body: unknown = {}) => read(await subscriptionAction(json(`/api/subscriptions/${id}/${action}`, "POST", body, headers), { params: { id, action } }));

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ACCOUNTING = await sessionHeaders("accounting");
  MASTER = await sessionHeaders("master");
  GENERAL = await sessionHeaders("general");
});

describe("billing plans", () => {
  it("lists the seeded plans and lets any admin create and edit one", async () => {
    const list = await read(await listPlans(new Request(BASE + "/api/plans"), {}));
    expect(list.status).toBe(200);
    expect(list.body.data.plans.map((p: any) => p.id)).toEqual(expect.arrayContaining([SEED_IDS.plan1, SEED_IDS.plan2]));

    expect((await read(await createPlanRoute(json("/api/plans", "POST", { merchantId: SEED_IDS.merchant2, name: "x", amount: 100, interval: "monthly", trialDays: 0, active: true }), {}))).status).toBe(401);
    const bad = await read(await createPlanRoute(json("/api/plans", "POST", { merchantId: SEED_IDS.merchant2, name: "", amount: 0, interval: "daily", trialDays: -1 }, GENERAL), {}));
    expect(bad.status).toBe(400);

    const created = await read(await createPlanRoute(json("/api/plans", "POST", { merchantId: SEED_IDS.merchant2, name: "Sakura monthly", amount: 1500, interval: "monthly", trialDays: 7, active: true }, GENERAL), {}));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Sakura monthly", amount: 1500, interval: "monthly", trialDays: 7, active: true });

    const updated = await read(await patchPlan(json(`/api/plans/${created.body.data.id}`, "PATCH", { name: "Sakura monthly", amount: 1800, interval: "monthly", trialDays: 7, active: false }, GENERAL), { params: { id: created.body.data.id } }));
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ amount: 1800, active: false });
    expect(await prisma.auditLog.count({ where: { action: { in: ["plan.create", "plan.update"] } } })).toBe(2);

    // A disabled plan accepts no new subscription.
    const refused = await read(await createSubscriptionRoute(json("/api/subscriptions?mode=test", "POST", { planId: created.body.data.id, customerId: "c1", customerName: "C", customerEmail: "" }, GENERAL), {}));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("plan_inactive");
  });
});

describe("subscriptions", () => {
  it("starts trialing with a trial and active without, in the requested mode", async () => {
    const trial = await read(await createSubscriptionRoute(json("/api/subscriptions?mode=test", "POST", { planId: SEED_IDS.plan1, customerId: "u_1", customerName: "Trial", customerEmail: "t@example.com" }, GENERAL), {}));
    expect(trial.status).toBe(201);
    expect(trial.body.data).toMatchObject({ status: "trialing", livemode: false, failCount: 0 });
    expect(new Date(trial.body.data.nextChargeAt).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);

    const live = await read(await createSubscriptionRoute(json("/api/subscriptions?mode=live", "POST", { planId: SEED_IDS.plan2, customerId: "u_2", customerName: "Yearly", customerEmail: "" }, GENERAL), {}));
    expect(live.status).toBe(201);
    expect(live.body.data).toMatchObject({ status: "active", livemode: true });
    expect(new Date(live.body.data.nextChargeAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const list = await read(await listSubscriptions(new Request(BASE + "/api/subscriptions?mode=live"), {}));
    expect(list.body.data.subscriptions.map((r: any) => r.id)).toEqual([live.body.data.id]);
    const csv = await listSubscriptions(new Request(BASE + "/api/subscriptions?mode=test&format=csv", { headers: MASTER }), {});
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain(SEED_IDS.subscription1);
  });

  it("charges through the transaction pipeline and advances the next charge date", async () => {
    const before = await prisma.subscription.findUniqueOrThrow({ where: { id: SEED_IDS.subscription1 } });
    expect((await act(SEED_IDS.subscription1, "charge", ACCOUNTING, { outcome: "success" })).status).toBe(403);
    const res = await act(SEED_IDS.subscription1, "charge", MASTER, { outcome: "success" });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toMatchObject({ ok: true, status: "active" });
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: SEED_IDS.subscription1 } });
    expect(after.status).toBe("active");
    expect(after.failCount).toBe(0);
    expect(after.nextChargeAt!.getTime()).toBe(addInterval(before.nextChargeAt!, "monthly").getTime());
    const payment = await prisma.payment.findFirst({ where: { subscriptionId: SEED_IDS.subscription1 }, orderBy: { createdAt: "desc" } });
    expect(payment).toMatchObject({ status: "captured", amount: 2980, merchantId: SEED_IDS.merchant1, livemode: false });
    expect(await prisma.webhookDelivery.count({ where: { event: "subscription.charged", merchantId: SEED_IDS.merchant1 } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "subscription.charge", targetId: SEED_IDS.subscription1 } })).toBe(1);
  });

  it("retries after 3 and 7 days and suspends on the third failure", async () => {
    const id = SEED_IDS.subscription1;
    const t0 = new Date(NOW);
    const first = await chargeSubscription(prisma, { subscriptionId: id, forceOutcome: "failure", now: t0 });
    expect(first.ok).toBe(false);
    let s = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ status: "past_due", failCount: 1 });
    expect(s.nextChargeAt!.getTime()).toBe(t0.getTime() + 3 * 86_400_000);

    const t1 = new Date(s.nextChargeAt!.getTime() + 1000);
    await chargeSubscription(prisma, { subscriptionId: id, forceOutcome: "failure", now: t1 });
    s = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ status: "past_due", failCount: 2 });
    expect(s.nextChargeAt!.getTime()).toBe(t1.getTime() + 7 * 86_400_000);

    const t2 = new Date(s.nextChargeAt!.getTime() + 1000);
    await chargeSubscription(prisma, { subscriptionId: id, forceOutcome: "failure", now: t2 });
    s = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ status: "suspended", failCount: 3, nextChargeAt: null });
    expect(await prisma.payment.count({ where: { subscriptionId: id, status: "failed" } })).toBe(3);
    const events = await prisma.webhookDelivery.findMany({ where: { merchantId: SEED_IDS.merchant1, event: { in: ["subscription.payment_failed", "subscription.suspended"] } }, select: { event: true } });
    expect(events.filter((e) => e.event === "subscription.payment_failed")).toHaveLength(2);
    expect(events.filter((e) => e.event === "subscription.suspended")).toHaveLength(1);
    expect(await prisma.emailLog.count({ where: { templateKey: { in: ["subscription_failed", "subscription_suspended"] } } })).toBe(3);

    // Suspended cannot be charged; resume makes it chargeable again, then a success clears the counter.
    expect((await act(id, "charge", MASTER, { outcome: "success" })).status).toBe(409);
    expect((await act(id, "resume", MASTER)).status).toBe(200);
    s = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe("active");
    const ok = await act(id, "charge", MASTER, { outcome: "success" });
    expect(ok.status).toBe(200);
    s = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ status: "active", failCount: 0 });
  });

  it("pauses, resumes and cancels with audit entries, rejecting invalid transitions", async () => {
    const id = SEED_IDS.subscription1;
    expect((await act(id, "resume", MASTER)).status).toBe(409);
    expect((await act(id, "pause", MASTER)).status).toBe(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id } })).status).toBe("suspended");
    expect((await act(id, "pause", MASTER)).status).toBe(409);
    expect((await act(id, "cancel", MASTER)).status).toBe(200);
    const s = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe("cancelled");
    expect(s.cancelledAt).not.toBeNull();
    expect((await act(id, "cancel", MASTER)).status).toBe(409);
    expect((await act(id, "bogus", MASTER)).status).toBe(404);
    const actions = (await prisma.auditLog.findMany({ where: { targetId: id, targetType: "subscription" }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["subscription.pause", "subscription.cancel"]));
  });

  it("the cron charges only due subscriptions and honours the demo failure setting", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await read(await cron(new Request(BASE + "/api/cron/subscriptions"), {}))).status).toBe(401);
    // 0 % failure so the outcome is deterministic.
    expect((await read(await putDemoSettings(json("/api/subscriptions/demo-settings", "PUT", { demoChargeFailPercent: 0 }, MASTER), {}))).status).toBe(200);
    expect((await read(await putDemoSettings(json("/api/subscriptions/demo-settings", "PUT", { demoChargeFailPercent: 0 }, GENERAL), {}))).status).toBe(403);

    const summary = await processDueSubscriptions(prisma, new Date(NOW.getTime() + 10 * 86_400_000));
    // subscription2 is past due (retry at NOW − 3 d); subscription1's next charge (NOW − 21 d) is also due.
    expect(summary.processed).toBe(2);
    expect(summary.succeeded).toBe(2);
    const s2 = await prisma.subscription.findUniqueOrThrow({ where: { id: SEED_IDS.subscription2 } });
    expect(s2).toMatchObject({ status: "active", failCount: 0 });

    const res = await read(await cron(new Request(BASE + "/api/cron/subscriptions", { headers: { authorization: "Bearer s3cret" } }), {}));
    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(0);
    vi.unstubAllEnvs();
  });
});

describe("payment links", () => {
  it("issues a link for the mode, exposes only public data, and any admin can disable it", async () => {
    expect((await read(await createLinkRoute(json("/api/payment-links?mode=test", "POST", { merchantId: SEED_IDS.merchant1, productName: "x", amount: 100, description: "", expiresAt: "", maxUses: null }), {}))).status).toBe(401);
    const created = await read(await createLinkRoute(json("/api/payment-links?mode=live", "POST", { merchantId: SEED_IDS.merchant1, productName: "Live item", amount: 1200, description: "d", expiresAt: "2026-12-31", maxUses: 3 }, GENERAL), {}));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: "active", livemode: true, usedCount: 0, maxUses: 3, unavailable: null });
    expect(created.body.data.token).toMatch(/^[a-z0-9]{24}$/);
    expect(new Date(created.body.data.expiresAt).toISOString()).toBe("2026-12-31T15:00:00.000Z");

    const list = await read(await listLinks(new Request(BASE + "/api/payment-links?mode=live"), {}));
    expect(list.body.data.links.map((r: any) => r.id)).toEqual([created.body.data.id]);

    const pub = await read(await publicLink(new Request(BASE + `/api/pay/${created.body.data.token}`), { params: { token: created.body.data.token } }));
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({ productName: "Live item", amount: 1200, unavailable: null, livemode: true });
    expect(pub.body.data).not.toHaveProperty("merchantId");
    expect(pub.body.data).not.toHaveProperty("createdById");

    const disabled = await read(await disableLink(json(`/api/payment-links/${created.body.data.id}/disable`, "POST", {}, GENERAL), { params: { id: created.body.data.id } }));
    expect(disabled.status).toBe(200);
    expect(disabled.body.data).toMatchObject({ status: "disabled", unavailable: "disabled" });
    expect((await read(await disableLink(json(`/api/payment-links/${created.body.data.id}/disable`, "POST", {}, GENERAL), { params: { id: created.body.data.id } }))).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: { in: ["payment_link.create", "payment_link.disable"] } } })).toBe(2);
  });

  it("hosted checkout creates an authorized transaction, counts the use, and the demo button completes it", async () => {
    const token = SEED_PAYMENT_LINK_TOKEN;
    const info = await read(await publicLink(new Request(BASE + `/api/pay/${token}`), { params: { token } }));
    expect(info.body.data.methods).toEqual(["credit", "qr"]);

    const bad = await read(await checkout(json(`/api/pay/${token}`, "POST", { method: "other", customerName: "", customerEmail: "" }), { params: { token } }));
    expect(bad.status).toBe(400);

    const res = await read(await checkout(json(`/api/pay/${token}`, "POST", { method: "credit", customerName: "Guest", customerEmail: "guest@example.com" }), { params: { token } }));
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ status: "authorized", amount: 3200, method: "credit" });
    expect(res.body.data.payment.orderNumber).toBe("LNK-KOTORI-0002");
    const link = await prisma.paymentLink.findUniqueOrThrow({ where: { token } });
    expect(link.usedCount).toBe(2);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: res.body.data.payment.id } });
    expect(payment).toMatchObject({ paymentLinkId: SEED_IDS.paymentLink1, merchantId: SEED_IDS.merchant1, customerEmail: "guest@example.com", livemode: false });

    // Completing a payment of a different link is refused; completing ours captures it.
    expect((await read(await completeCheckout(json(`/api/pay/sakurademolinktoken000002/complete`, "POST", { paymentId: payment.id }), { params: { token: "sakurademolinktoken000002" } }))).status).toBe(404);
    const done = await read(await completeCheckout(json(`/api/pay/${token}/complete`, "POST", { paymentId: payment.id }), { params: { token } }));
    expect(done.status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("captured");
    expect((await read(await completeCheckout(json(`/api/pay/${token}/complete`, "POST", { paymentId: payment.id }), { params: { token } }))).status).toBe(409);

    // Bank transfer (once the merchant enables it) issues a transfer id and deadline.
    await prisma.merchant.update({ where: { id: SEED_IDS.merchant1 }, data: { enabledMethods: JSON.stringify(["credit", "qr", "bank"]) } });
    const bank = await read(await checkout(json(`/api/pay/${token}`, "POST", { method: "bank", customerName: "Bank guest", customerEmail: "" }), { params: { token } }));
    expect(bank.status).toBe(201);
    expect(bank.body.data.payment.status).toBe("awaiting_transfer");
    expect(bank.body.data.payment.transferId).toMatch(/^\d{7,8}$/);
    expect(bank.body.data.payment.transferDueAt).toBeTruthy();
  });

  it("refuses disabled, expired and exhausted links", async () => {
    const disabledToken = "sakurademolinktoken000002";
    const r1 = await read(await checkout(json(`/api/pay/${disabledToken}`, "POST", { method: "credit", customerName: "A", customerEmail: "" }), { params: { token: disabledToken } }));
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("link_disabled");

    await prisma.paymentLink.update({ where: { token: SEED_PAYMENT_LINK_TOKEN }, data: { maxUses: 1 } });
    const r2 = await read(await checkout(json(`/api/pay/${SEED_PAYMENT_LINK_TOKEN}`, "POST", { method: "credit", customerName: "A", customerEmail: "" }), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    expect(r2.body.error.code).toBe("link_exhausted");

    await prisma.paymentLink.update({ where: { token: SEED_PAYMENT_LINK_TOKEN }, data: { maxUses: null, expiresAt: new Date(Date.now() - 1000) } });
    const r3 = await read(await checkout(json(`/api/pay/${SEED_PAYMENT_LINK_TOKEN}`, "POST", { method: "credit", customerName: "A", customerEmail: "" }), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    expect(r3.body.error.code).toBe("link_expired");
    const pub = await read(await publicLink(new Request(BASE + `/api/pay/${SEED_PAYMENT_LINK_TOKEN}`), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    expect(pub.body.data.unavailable).toBe("expired");
    expect((await read(await publicLink(new Request(BASE + "/api/pay/nope"), { params: { token: "nope" } }))).status).toBe(404);
  });
});

describe("agent fees", () => {
  it("rounds down per batch", () => {
    expect(agentFee(120_480, 3.5)).toBe(4216);
    expect(agentFee(84_688, 2)).toBe(1693);
    expect(agentFee(-500, 3.5)).toBe(0);
  });

  it("aggregates confirmed / scheduled / paid batches of the month by agent and exports CSV", async () => {
    // Seed: settlement1 (merchant1 → agent1, paid, 120,480) and settlement2 (merchant3, no agent) in last month.
    const lastMonth = "2026-08";
    const res = await read(await agentFeesRoute(new Request(BASE + `/api/agent-fees?month=${lastMonth}&mode=test`), {}));
    expect(res.status).toBe(200);
    expect(res.body.data.month).toBe(lastMonth);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({ agentId: SEED_IDS.agent1, feeRate: 3.5, merchantCount: 1, batchCount: 1, netAmount: 120_480, fee: 4216 });

    // A held batch is not counted; a scheduled one for an agent-2 merchant is.
    await prisma.settlementBatch.update({ where: { id: SEED_IDS.settlement1 }, data: { status: "held", holdReason: "check" } });
    await prisma.settlementBatch.create({ data: { merchantId: SEED_IDS.merchant2, livemode: false, periodFrom: new Date("2026-07-31T15:00:00Z"), periodTo: new Date("2026-08-31T15:00:00Z"), grossAmount: 10_000, feeAmount: 0, refundAmount: 0, chargebackAmount: 0, settlementFee: 0, netAmount: 10_000, status: "scheduled", scheduledAt: new Date("2026-09-15T00:00:00Z"), createdById: null } });
    const again = await read(await agentFeesRoute(new Request(BASE + `/api/agent-fees?month=${lastMonth}&mode=test`), {}));
    expect(again.body.data.rows).toHaveLength(1);
    expect(again.body.data.rows[0]).toMatchObject({ agentId: SEED_IDS.agent2, feeRate: 2, fee: 200 });

    const filtered = await read(await agentFeesRoute(new Request(BASE + `/api/agent-fees?month=${lastMonth}&mode=test&agent=${SEED_IDS.agent1}`), {}));
    expect(filtered.body.data.rows).toHaveLength(0);
    expect((await read(await agentFeesRoute(new Request(BASE + "/api/agent-fees?month=bad&mode=test"), {}))).body.data.month).toMatch(/^\d{4}-\d{2}$/);

    const csv = await agentFeesRoute(new Request(BASE + `/api/agent-fees?month=${lastMonth}&mode=test&format=csv`, { headers: MASTER }), {});
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain("AGT-00002");
    expect(text).toContain("200");
  });
});
