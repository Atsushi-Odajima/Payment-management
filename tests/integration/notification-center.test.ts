// Phase J: notification centre — emitters wired into the services, role
// visibility, read marks, per-admin preferences with e-mail / Slack fan-out,
// the Slack sender (retry + log) and the daily digest cron.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { DEMO_ADMIN_ACCOUNTS } from "@/prisma/seed-accounts";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { GET as unreadRoute } from "@/app/api/notifications/unread/route";
import { POST as readOne } from "@/app/api/notifications/[id]/read/route";
import { POST as readAll } from "@/app/api/notifications/read-all/route";
import { GET as getPrefs, PUT as putPrefs } from "@/app/api/notifications/preferences/route";
import { PUT as putGlobal } from "@/app/api/global-settings/route";
import { POST as slackTest } from "@/app/api/global-settings/slack-test/route";
import { GET as cron } from "@/app/api/cron/notifications/route";
import { POST as createRefund } from "@/app/api/refunds/route";
import { POST as generateSettlement } from "@/app/api/settlements/generate/route";
import { PUT as putControl } from "@/app/api/payment-method-controls/route";
import { attemptDelivery, enqueueWebhook } from "@/lib/webhooks/deliver";
import { emitNotification } from "@/lib/notifications/emit";
import { dispatchPendingNotifications, sendSlack } from "@/lib/notifications/deliver";
import { runDailyDigests } from "@/lib/notifications/digest";
import { runCron } from "@/lib/cron/run";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let ADMIN: Record<string, string> = {};
let CS: Record<string, string> = {};
let ACCOUNTING: Record<string, string> = {};
let DEVELOPER: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const list = async (h: Record<string, string>, qs = "") => read(await listNotifications(new Request(BASE + "/api/notifications" + qs, { headers: h }), {}));

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
  CS = await sessionHeaders("cs");
  ACCOUNTING = await sessionHeaders("accounting");
  DEVELOPER = await sessionHeaders("developer");
  vi.restoreAllMocks();
});

describe("visibility, reading and the bell", () => {
  it("shows only the notifications addressed to the admin's role, tracks reads per admin", async () => {
    // Seed: webhook.abandoned (admin/developer), refund.requested (admin/accounting), payment_method.suspended (admin/cs).
    expect((await list(ADMIN)).body.data.total).toBe(3);
    expect((await list(DEVELOPER)).body.data.notifications.map((n: any) => n.kind)).toEqual(["webhook.abandoned"]);
    expect((await list(ACCOUNTING)).body.data.notifications.map((n: any) => n.kind)).toEqual(["refund.requested"]);
    expect((await list(CS)).body.data.notifications.map((n: any) => n.kind)).toEqual(["payment_method.suspended"]);
    expect((await listNotifications(new Request(BASE + "/api/notifications"), {})).status).toBe(401);

    const bell = await read(await unreadRoute(new Request(BASE + "/api/notifications/unread", { headers: ADMIN }), {}));
    expect(bell.body.data.unread).toBe(3);
    expect(bell.body.data.notifications).toHaveLength(3);
    expect((await read(await unreadRoute(new Request(BASE + "/api/notifications/unread"), {}))).body.data.unread).toBe(0);

    // Filters.
    expect((await list(ADMIN, "?severity=critical")).body.data.total).toBe(1);
    expect((await list(ADMIN, "?kind=refund.requested")).body.data.total).toBe(1);
    expect((await list(ADMIN, "?from=2026-08-31&to=2026-09-01")).body.data.total).toBe(3);
    expect((await list(ADMIN, "?from=2026-09-01&to=2026-09-01")).body.data.total).toBe(2);

    // Reading is per admin; a developer cannot mark another role's notification.
    expect((await read(await readOne(json(`/api/notifications/${SEED_IDS.notification2}/read`, "POST", {}, DEVELOPER), { params: { id: SEED_IDS.notification2 } }))).status).toBe(404);
    const one = await read(await readOne(json(`/api/notifications/${SEED_IDS.notification2}/read`, "POST", {}, ADMIN), { params: { id: SEED_IDS.notification2 } }));
    expect(one.body.data.unread).toBe(2);
    expect((await list(ADMIN, "?read=unread")).body.data.total).toBe(2);
    expect((await list(ACCOUNTING, "?read=unread")).body.data.total).toBe(1);
    const all = await read(await readAll(json("/api/notifications/read-all", "POST", {}, ADMIN), {}));
    expect(all.body.data.marked).toBe(2);
    expect((await list(ADMIN)).body.data.unread).toBe(0);
  });
});

describe("emitters", () => {
  it("refund request → info to admin / accounting; settlement generation → info; method suspension → critical", async () => {
    const before = (await list(ADMIN)).body.data.total;
    expect((await read(await createRefund(json("/api/refunds", "POST", { paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "customer" }, CS), {}))).status).toBe(201);
    const refundNotice = await prisma.notification.findFirst({ where: { kind: "refund.requested", createdAt: { gte: NOW } }, orderBy: { createdAt: "desc" } });
    expect(refundNotice).toMatchObject({ severity: "info", roles: JSON.stringify(["admin", "accounting"]) });
    expect(refundNotice!.dispatchedAt).not.toBeNull(); // emitted inside the request's transaction → fanned out by withApiHandler after the commit

    expect((await read(await generateSettlement(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant2, from: "2026-07-01", to: "2026-07-31" }, ACCOUNTING), {}))).status).toBe(201);
    expect(await prisma.notification.count({ where: { kind: "settlement.generated" } })).toBe(1);

    expect((await read(await putControl(json("/api/payment-method-controls", "PUT", { scope: "global", method: "bank", suspended: true, reason: "test" }, ADMIN), {}))).status).toBe(200);
    expect(await prisma.notification.count({ where: { kind: "payment_method.suspended", severity: "critical" } })).toBe(1);
    expect((await list(ADMIN)).body.data.total).toBeGreaterThan(before);
  });

  it("an abandoned webhook raises a critical notification once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const id = await enqueueWebhook(prisma, { merchantId: SEED_IDS.merchant1, paymentId: SEED_IDS.payment1, event: "payment.completed", livemode: false, values: { payment_id: SEED_IDS.payment1, transaction_id: "", amount: "4980", currency: "JPY", paid_at: NOW.toISOString(), status: "captured", payment_method: "credit", user_id: "u", product_id: "p", domain: "" } });
    let t = NOW;
    for (let i = 0; i < 5; i++) {
      await attemptDelivery(prisma, id!, "cron", t);
      t = new Date(t.getTime() + 25 * 3_600_000);
    }
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! } })).status).toBe("abandoned");
    const n = await prisma.notification.findMany({ where: { kind: "webhook.abandoned", targetId: id! } });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ severity: "critical", href: `/webhook-logs/${id}` });
    vi.unstubAllGlobals();
  });

  it("a failing cron job raises batch.failed and re-throws", async () => {
    await expect(runCron("unit-test", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const n = await prisma.notification.findFirst({ where: { kind: "batch.failed", targetId: "unit-test" } });
    expect(n).toMatchObject({ severity: "critical", body: "boom" });
    // Deduplicated within 24 h.
    await expect(runCron("unit-test", async () => { throw new Error("boom again"); })).rejects.toThrow();
    expect(await prisma.notification.count({ where: { kind: "batch.failed", targetId: "unit-test" } })).toBe(1);
  });

  it("daily digests: one overdue-transfer notice per day and chargeback reminders within three days", async () => {
    // Seed: payment5 is overdue (bank, awaiting); chargeback1 has a deadline ~14 days out.
    const first = await runDailyDigests(prisma, NOW);
    expect(first.transferOverdue).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.count({ where: { kind: "transfer.overdue" } })).toBe(1);
    await runDailyDigests(prisma, new Date(NOW.getTime() + 3_600_000));
    expect(await prisma.notification.count({ where: { kind: "transfer.overdue" } })).toBe(1);
    await runDailyDigests(prisma, new Date(NOW.getTime() + 25 * 3_600_000));
    expect(await prisma.notification.count({ where: { kind: "transfer.overdue" } })).toBe(2);

    expect(await prisma.notification.count({ where: { kind: "chargeback.deadline" } })).toBe(0);
    await prisma.chargeback.update({ where: { id: SEED_IDS.chargeback1 }, data: { disputeDeadlineAt: new Date(NOW.getTime() + 2 * 86_400_000) } });
    const r = await runDailyDigests(prisma, NOW);
    expect(r.chargebackReminders).toBe(1);
    expect(await prisma.notification.count({ where: { kind: "chargeback.deadline", targetId: SEED_IDS.chargeback1 } })).toBe(1);

    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await read(await cron(new Request(BASE + "/api/cron/notifications"), {}))).status).toBe(401);
    const res = await read(await cron(new Request(BASE + "/api/cron/notifications", { headers: { authorization: "Bearer s3cret" } }), {}));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("dispatched");
    vi.unstubAllEnvs();
  });
});

describe("preferences and fan-out", () => {
  it("e-mail preference logs a templated e-mail; Slack needs the webhook URL and is logged with retry", async () => {
    const prefs = await read(await getPrefs(new Request(BASE + "/api/notifications/preferences", { headers: ADMIN }), {}));
    expect(prefs.body.data.slackConfigured).toBe(false);
    expect(prefs.body.data.preferences.find((p: any) => p.kind === "payment_method.suspended")).toMatchObject({ email: true, slack: false });

    const saved = await read(await putPrefs(json("/api/notifications/preferences", "PUT", { preferences: [{ kind: "refund.requested", email: true, slack: true }] }, ACCOUNTING), {}));
    expect(saved.status).toBe(200);
    expect(saved.body.data.preferences.find((p: any) => p.kind === "refund.requested")).toMatchObject({ email: true, slack: true });
    expect((await read(await putPrefs(json("/api/notifications/preferences", "PUT", { preferences: [{ kind: "nope", email: true, slack: false }] }, ACCOUNTING), {}))).status).toBe(400);

    // A refund request → the accounting admin gets an e-mail (logged), and Slack is skipped without a URL.
    await createRefund(json("/api/refunds", "POST", { paymentId: SEED_IDS.payment1, amount: 100, reasonCode: "customer" }, CS), {});
    await dispatchPendingNotifications(prisma);
    const mail = await prisma.emailLog.findFirst({ where: { templateKey: "notification", to: DEMO_ADMIN_ACCOUNTS.accounting.email }, orderBy: { createdAt: "desc" } });
    expect(mail).not.toBeNull();
    expect(mail!.subject).toContain("Refund requested");
    expect(await prisma.slackLog.count()).toBe(0);

    // Configure Slack (admin only) → the next refund notification is posted (demo mode → logged as demo).
    expect((await read(await putGlobal(json("/api/global-settings", "PUT", { viewerCsvExport: false, slackWebhookUrl: "https://example.com/not-slack" }, ADMIN), {}))).status).toBe(400);
    expect((await read(await putGlobal(json("/api/global-settings", "PUT", { viewerCsvExport: false, slackWebhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX" }, ADMIN), {}))).status).toBe(200);
    expect((await read(await getPrefs(new Request(BASE + "/api/notifications/preferences", { headers: ADMIN }), {}))).body.data.slackConfigured).toBe(true);
    await createRefund(json("/api/refunds", "POST", { paymentId: SEED_IDS.payment1, amount: 200, reasonCode: "customer" }, CS), {});
    await dispatchPendingNotifications(prisma);
    const slack = await prisma.slackLog.findFirst({ orderBy: { createdAt: "desc" } });
    expect(slack).toMatchObject({ status: "demo" });
    expect(slack!.text).toContain("Refund requested");

    // Real send path: first attempt 500 → retry 200 → sent with 2 attempts; two failures → failed.
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("no", { status: 500 })).mockResolvedValueOnce(new Response("ok", { status: 200 })).mockResolvedValue(new Response("no", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await sendSlack(prisma, { text: "hello", url: "https://hooks.slack.com/services/T/B/C", force: true });
    expect(ok).toMatchObject({ status: "sent", attempts: 2, responseStatus: 200 });
    const bad = await sendSlack(prisma, { text: "hello", url: "https://hooks.slack.com/services/T/B/C", force: true });
    expect(bad).toMatchObject({ status: "failed", attempts: 2, error: "http_503" });
    vi.unstubAllGlobals();
    expect((await read(await slackTest(json("/api/global-settings/slack-test", "POST", {}, CS), {}))).status).toBe(403);
    expect((await read(await slackTest(json("/api/global-settings/slack-test", "POST", { url: "https://hooks.slack.com/services/T/B/C" }, ADMIN), {}))).body.data.status).toBe("demo");
  });

  it("emitNotification never throws and dedupes per target", async () => {
    const a = await emitNotification(prisma, { kind: "merchant.created", title: "x", body: "y", targetType: "merchant", targetId: "m1", now: NOW });
    const b = await emitNotification(prisma, { kind: "merchant.created", title: "x", body: "y", targetType: "merchant", targetId: "m1", now: new Date(NOW.getTime() + 60_000) });
    const c = await emitNotification(prisma, { kind: "merchant.created", title: "x", body: "y", targetType: "merchant", targetId: "m1", now: new Date(NOW.getTime() + 25 * 3_600_000) });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    expect(c).toBeTruthy();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: a! } })).dispatchedAt).not.toBeNull();
  });
});
