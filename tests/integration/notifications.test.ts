// Phase G: aggregated reports, email templates / rendering / logs with the
// event hooks, and announcements (draft → publish → end, incident timeline,
// banner query, merchant API).

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_API_KEYS, SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as getReport } from "@/app/api/reports/route";
import { GET as getTemplates } from "@/app/api/email-templates/route";
import { PATCH as patchTemplate } from "@/app/api/email-templates/[id]/route";
import { GET as getEmailLogs } from "@/app/api/email-logs/route";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { GET as listAnnouncements, POST as createAnnouncement } from "@/app/api/announcements/route";
import { POST as announcementAction } from "@/app/api/announcements/[id]/[action]/route";
import { GET as merchantAnnouncements } from "@/app/api/merchant-api/announcements/route";
import { loadActiveAnnouncements } from "@/lib/announcements/list";
import { renderTemplate, placeholdersIn } from "@/lib/email/templates";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let MASTER: Record<string, string> = {};
let GENERAL: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...MASTER, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
  GENERAL = await sessionHeaders("general");
});

describe("reports", () => {
  it("aggregates KPIs, series, shares and ranking for the period and exports CSV", async () => {
    const res = await read(await getReport(new Request(BASE + "/api/reports?granularity=custom&from=2026-08-01&to=2026-09-02&mode=test"), {}));
    expect(res.status).toBe(200);
    const r = res.body.data;
    // Seed (test mode, NOW): payment1/2/3/4/5/6/7, the konbini slips 14/15 and the expired transfer 16 created within the window; 4 completed (1, 2, 7, 15).
    expect(r.totals.applications).toBe(10);
    expect(r.totals.completed).toBe(4);
    expect(r.totals.completedAmount).toBe(4980 + 1280 + 12000 + 5400);
    expect(r.totals.successRate).toBe(40);
    expect(r.totals.averageAmount).toBe(5915);
    expect(r.shares.map((s: any) => s.method).sort()).toEqual(["bank", "convenience", "credit", "qr"]);
    expect(r.ranking[0].merchantCode).toBe("MER-00003");
    expect(r.series.reduce((s: number, p: any) => s + p.applications, 0)).toBe(10);
    const monthly = await read(await getReport(new Request(BASE + "/api/reports?granularity=monthly&from=2026-08-01&to=2026-09-30&merchant=" + SEED_IDS.merchant1), {}));
    expect(monthly.body.data.series.every((p: any) => /^\d{4}-\d{2}$/.test(p.bucket))).toBe(true);
    expect(monthly.body.data.totals.applications).toBe(2);

    const summary = await getReport(new Request(BASE + "/api/reports?granularity=custom&from=2026-08-01&to=2026-09-02&format=csv", { headers: MASTER }), {});
    expect(summary.headers.get("content-type")).toContain("text/csv");
    expect((await summary.text())).toContain("bucket,applications,completed,amount");
    const detail = await getReport(new Request(BASE + "/api/reports?granularity=custom&from=2026-08-01&to=2026-09-02&format=csv&kind=detail", { headers: MASTER }), {});
    expect((await detail.text()).split("\r\n").filter(Boolean)).toHaveLength(11);
  });
});

describe("email templates and log", () => {
  it("renders placeholders and seeds both languages of every template", async () => {
    expect(renderTemplate("Hi {{customerName}}, {{ amount }} / {{missing}}", { customerName: "A", amount: "¥1" })).toBe("Hi A, ¥1 / ");
    expect(placeholdersIn("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
    const list = await read(await getTemplates(new Request(BASE + "/api/email-templates"), {}));
    expect(list.body.data.templates).toHaveLength(20);
  });

  it("logs event emails (demo provider) and lets a master edit / disable templates", async () => {
    // Completing a transaction emails the customer.
    // payment10 (live, awaiting transfer) carries a customer email.
    await paymentAction(json(`/api/payments/${SEED_IDS.payment10}/capture`, "POST", undefined, MASTER), { params: { id: SEED_IDS.payment10, action: "capture" } });
    const completed = await prisma.emailLog.findFirst({ where: { paymentId: SEED_IDS.payment10, templateKey: "payment_completed" } });
    expect(completed).toMatchObject({ status: "demo", provider: "log", lang: "ja", to: "yumi@example.com" });
    expect(completed!.subject).toContain("ORD-LIVE-003");
    expect(completed!.body).toContain("9,800");

    // A bank transfer checkout emails the transfer instructions.
    const created = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.bankProvider, merchantId: SEED_IDS.merchant2, orderNumber: "ORD-MAIL-1", amount: 5000, customerName: "T", customerEmail: "t@example.com" }), {}));
    const guide = await prisma.emailLog.findFirst({ where: { paymentId: created.body.data.id, templateKey: "transfer_guide" } });
    expect(guide!.body).toContain(created.body.data.transferId);
    expect(guide!.to).toBe("t@example.com");
    // No email address → nothing logged.
    const anon = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.bankProvider, merchantId: SEED_IDS.merchant2, orderNumber: "ORD-MAIL-2", amount: 5000 }), {}));
    expect(await prisma.emailLog.count({ where: { paymentId: anon.body.data.id } })).toBe(0);

    const tpl = await prisma.emailTemplate.findUniqueOrThrow({ where: { key_lang: { key: "payment_completed", lang: "ja" } } });
    expect((await read(await patchTemplate(json(`/api/email-templates/${tpl.id}`, "PATCH", { subject: "x", body: "y", enabled: false }, GENERAL), { params: { id: tpl.id } }))).status).toBe(403);
    const edited = await read(await patchTemplate(json(`/api/email-templates/${tpl.id}`, "PATCH", { subject: "Paid {{orderNumber}}", body: "Thanks {{customerName}}", enabled: false }, MASTER), { params: { id: tpl.id } }));
    expect(edited.body.data).toMatchObject({ subject: "Paid {{orderNumber}}", enabled: false });
    expect(await prisma.auditLog.count({ where: { action: "email_template.update", targetId: tpl.id } })).toBe(1);
    // Disabled → no completion email for the next capture (the transfer guide above stays).
    await paymentAction(json(`/api/payments/${created.body.data.id}/capture`, "POST", undefined, MASTER), { params: { id: created.body.data.id, action: "capture" } });
    expect(await prisma.emailLog.count({ where: { paymentId: created.body.data.id, templateKey: "payment_completed" } })).toBe(0);

    const logs = await read(await getEmailLogs(new Request(BASE + "/api/email-logs?template=transfer_guide"), {}));
    expect(logs.body.data.total).toBe(2); // seeded + ORD-MAIL-1
    const csv = await getEmailLogs(new Request(BASE + "/api/email-logs?format=csv", { headers: MASTER }), {});
    expect(csv.headers.get("content-type")).toContain("text/csv");
  });
});

describe("announcements", () => {
  it("creates drafts, publishes, records incident updates, ends, and serves the merchant API", async () => {
    const draft = await read(await createAnnouncement(json("/api/announcements", "POST", { kind: "notice", title: "New feature", body: "Payment links are here", targetAll: false, targetMerchantIds: [SEED_IDS.merchant1] }, GENERAL), {}));
    expect(draft.status).toBe(201);
    expect(draft.body.data).toMatchObject({ status: "draft", active: false, targetMerchantIds: [SEED_IDS.merchant1] });
    const id = draft.body.data.id as string;
    expect((await loadActiveAnnouncements(SEED_IDS.merchant1)).map((a) => a.id)).not.toContain(id);

    const published = await read(await announcementAction(json(`/api/announcements/${id}/publish`, "POST", undefined, GENERAL), { params: { id, action: "publish" } }));
    expect(published.body.data).toMatchObject({ status: "published", active: true });
    expect((await loadActiveAnnouncements(SEED_IDS.merchant1)).map((a) => a.id)).toContain(id);
    expect((await loadActiveAnnouncements(SEED_IDS.merchant2)).map((a) => a.id)).not.toContain(id); // audience-restricted

    const incident = await read(await createAnnouncement(json("/api/announcements", "POST", { kind: "incident", title: "API errors", body: "Elevated 5xx", publish: true }, MASTER), {}));
    expect(incident.body.data.updates).toHaveLength(1);
    expect(incident.body.data.updates[0].phase).toBe("occurred");
    const iid = incident.body.data.id as string;
    const investigating = await read(await announcementAction(json(`/api/announcements/${iid}/update`, "POST", { phase: "investigating", body: "Rolling back" }, MASTER), { params: { id: iid, action: "update" } }));
    expect(investigating.body.data.updates.map((u: any) => u.phase)).toEqual(["occurred", "investigating"]);

    // Merchant API: merchant1's key sees the notice (targeted) + incident + seeded maintenance; merchant2's key would not see the notice.
    const bearer = new Request(BASE + "/api/merchant-api/announcements", { headers: { authorization: `Bearer ${SEED_API_KEYS[SEED_IDS.apiKey1]}` } });
    const mine = await read(await merchantAnnouncements(bearer, {}));
    expect(mine.body.data.announcements.map((a: any) => a.kind).sort()).toEqual(["incident", "maintenance", "notice"]);

    const ended = await read(await announcementAction(json(`/api/announcements/${id}/end`, "POST", undefined, GENERAL), { params: { id, action: "end" } }));
    expect(ended.body.data.status).toBe("ended");
    expect((await read(await announcementAction(json(`/api/announcements/${id}/end`, "POST", undefined, GENERAL), { params: { id, action: "end" } }))).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { targetType: "announcement", targetId: id } })).toBe(3);
    const all = await read(await listAnnouncements(new Request(BASE + "/api/announcements"), {}));
    expect(all.body.data.total).toBe(4); // 2 seeded + notice + incident
    const active = await read(await listAnnouncements(new Request(BASE + "/api/announcements?active=1"), {}));
    expect(active.body.data.announcements.map((a: any) => a.id)).toContain(iid);
  });
});
