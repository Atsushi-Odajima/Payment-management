// Phase I-2 / I-3: transaction notes (timeline, author-only edits, admin
// delete with audit, pins) and payment-method suspension (global / merchant
// switches, enforcement in createTransaction and the hosted checkout, auto
// resume, notifications).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, SEED_PAYMENT_LINK_TOKEN, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listNotes, POST as postNote } from "@/app/api/payments/[id]/notes/route";
import { DELETE as deleteNoteRoute, PATCH as patchNote } from "@/app/api/payments/[id]/notes/[noteId]/route";
import { GET as getControls, PUT as putControl } from "@/app/api/payment-method-controls/route";
import { GET as cron } from "@/app/api/cron/payment-method-controls/route";
import { POST as createPayment } from "@/app/api/payments/route";
import { GET as publicLink, POST as checkout } from "@/app/api/pay/[token]/route";
import { loadTransactions } from "@/lib/payments/list";
import { SALES_STATUSES } from "@/lib/payments/transitions";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let ADMIN: Record<string, string> = {};
let CS: Record<string, string> = {};
let ACCOUNTING: Record<string, string> = {};
let VIEWER: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const control = async (body: unknown, h: Record<string, string>) => read(await putControl(json("/api/payment-method-controls", "PUT", body, h), {}));

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
  CS = await sessionHeaders("cs");
  ACCOUNTING = await sessionHeaders("accounting");
  VIEWER = await sessionHeaders("viewer");
});

describe("transaction notes", () => {
  const id = SEED_IDS.payment1;
  const note = async (body: unknown, h: Record<string, string>) => read(await postNote(json(`/api/payments/${id}/notes`, "POST", body, h), { params: { id } }));

  it("staff post notes, viewer cannot, anonymous cannot", async () => {
    expect((await note({ body: "x" }, {})).status).toBe(401);
    expect((await note({ body: "x" }, VIEWER)).status).toBe(403);
    expect((await note({ body: "" }, CS)).status).toBe(400);
    const created = await note({ body: "Customer called about delivery" }, CS);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ body: "Customer called about delivery", pinned: false, author: { loginId: "general" } });
    const list = await read(await listNotes(new Request(BASE + `/api/payments/${id}/notes`), { params: { id } }));
    expect(list.body.data).toHaveLength(1);
    // Notes are not audited (only deletions are).
    expect(await prisma.auditLog.count({ where: { targetId: id, action: { startsWith: "payment.note" } } })).toBe(0);
  });

  it("only the author edits the text, admin / cs pin, admin deletes with an audit entry", async () => {
    const created = await note({ body: "first" }, CS);
    const noteId = created.body.data.id as string;
    const patch = async (body: unknown, h: Record<string, string>) => read(await patchNote(json(`/api/payments/${id}/notes/${noteId}`, "PATCH", body, h), { params: { id, noteId } }));
    const byAdmin = await patch({ body: "edited by admin" }, ADMIN);
    expect(byAdmin.status).toBe(403);
    expect(byAdmin.body.error.code).toBe("not_author");
    const byAuthor = await patch({ body: "edited by author" }, CS);
    expect(byAuthor.status).toBe(200);
    expect(byAuthor.body.data.editedAt).toBeTruthy();
    // accounting may neither pin nor edit someone else's note.
    expect((await patch({ pinned: true }, ACCOUNTING)).status).toBe(403);
    expect((await patch({ pinned: true }, CS)).body.data.pinned).toBe(true);
    // Pinned notes show up as a count on the list rows.
    const list = await loadTransactions({ allowedStatuses: SALES_STATUSES, filters: { method: "", status: "", merchant: "", from: "", to: "", mode: "test" }, page: 1, pageSize: 50, order: "sales" });
    expect(list.items.find((i) => i.id === id)?.pinnedNotes).toBe(1);

    const del = async (h: Record<string, string>) => read(await deleteNoteRoute(json(`/api/payments/${id}/notes/${noteId}`, "DELETE", undefined, h), { params: { id, noteId } }));
    expect((await del(CS)).status).toBe(403);
    expect((await del(ADMIN)).status).toBe(200);
    expect(await prisma.transactionNote.count({ where: { id: noteId } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({ where: { action: "payment.note_delete", targetId: id } });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit!.before!)).toMatchObject({ noteId, body: "edited by author" });
  });
});

describe("payment method suspension", () => {
  it("global switches: admin only, reason required, audited, critical notification, red-banner data", async () => {
    const body = { scope: "global", method: "credit", suspended: true, reason: "" };
    expect((await control(body, ADMIN)).status).toBe(400);
    expect((await control({ ...body, reason: "acquirer outage" }, CS)).status).toBe(403);
    expect((await control({ ...body, reason: "acquirer outage" }, ACCOUNTING)).status).toBe(403);
    const res = await control({ ...body, reason: "acquirer outage" }, ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ scope: "global", method: "credit", suspended: true, reason: "acquirer outage" });
    const list = await read(await getControls(new Request(BASE + "/api/payment-method-controls"), {}));
    expect(list.body.data.global.find((c: any) => c.method === "credit").suspended).toBe(true);
    expect(list.body.data.global.find((c: any) => c.method === "bank").suspended).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "payment_method.suspend" } })).toBe(1);
    const n = await prisma.notification.findFirst({ where: { kind: "payment_method.suspended", targetId: res.body.data.id } });
    expect(n).toMatchObject({ severity: "critical" });

    // createTransaction refuses the suspended method for every merchant …
    const create = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: "SUSP-1", amount: 1000, productName: "x", customerName: "c", customerId: "u1" }, ADMIN), {}));
    expect(create.status).toBe(409);
    expect(create.body.error.code).toBe("method_suspended");
    expect(create.body.error.details).toMatchObject({ scope: "global", method: "credit" });
    // … other methods still work.
    expect((await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.paypayProvider, merchantId: SEED_IDS.merchant1, orderNumber: "SUSP-2", amount: 1000, productName: "x", customerName: "c", customerId: "u1" }, ADMIN), {}))).status).toBe(201);
    // … and the hosted checkout hides it.
    const pub = await read(await publicLink(new Request(BASE + `/api/pay/${SEED_PAYMENT_LINK_TOKEN}`), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    expect(pub.body.data.methods).toEqual(["qr"]);
    const co = await read(await checkout(json(`/api/pay/${SEED_PAYMENT_LINK_TOKEN}`, "POST", { method: "credit", customerName: "A", customerEmail: "" }), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    expect(co.status).toBe(400);

    // Resume: audited, no reason needed.
    expect((await control({ scope: "global", method: "credit", suspended: false }, ADMIN)).body.data.suspended).toBe(false);
    expect((await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: "SUSP-3", amount: 1000, productName: "x", customerName: "c", customerId: "u1" }, ADMIN), {}))).status).toBe(201);
    expect(await prisma.auditLog.count({ where: { action: "payment_method.resume" } })).toBe(1);
  });

  it("merchant switches: admin and cs, scoped to the merchant, seeded sample blocks merchant2 QR", async () => {
    // Seed: merchant2 has QR suspended.
    const m2 = await read(await getControls(new Request(BASE + `/api/payment-method-controls?merchantId=${SEED_IDS.merchant2}`), {}));
    expect(m2.body.data.merchant.find((c: any) => c.method === "qr").suspended).toBe(true);
    const blocked = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.paypayProvider, merchantId: SEED_IDS.merchant2, orderNumber: "MS-1", amount: 500, productName: "x", customerName: "c", customerId: "u1" }, ADMIN), {}));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details).toMatchObject({ scope: "merchant" });
    // merchant1 is unaffected.
    expect((await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.paypayProvider, merchantId: SEED_IDS.merchant1, orderNumber: "MS-2", amount: 500, productName: "x", customerName: "c", customerId: "u1" }, ADMIN), {}))).status).toBe(201);

    expect((await control({ scope: "merchant", merchantId: SEED_IDS.merchant1, method: "bank", suspended: true, reason: "merchant request" }, ACCOUNTING)).status).toBe(403);
    expect((await control({ scope: "merchant", method: "bank", suspended: true, reason: "no merchant" }, CS)).status).toBe(400);
    const res = await control({ scope: "merchant", merchantId: SEED_IDS.merchant1, method: "bank", suspended: true, reason: "merchant request" }, CS);
    expect(res.status).toBe(200);
    const n = await prisma.notification.findFirst({ where: { kind: "payment_method.suspended", targetId: res.body.data.id } });
    expect(n).toMatchObject({ severity: "warning" });
    const bank = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.bankProvider, merchantId: SEED_IDS.merchant1, orderNumber: "MS-3", amount: 500, productName: "x", customerName: "c", customerId: "u1" }, ADMIN), {}));
    expect(bank.status).toBe(409);
  });

  it("scheduled resume: the cron resumes due switches and suppresses duplicate notifications", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const past = new Date(NOW.getTime() - 1000).toISOString();
    expect((await control({ scope: "global", method: "bank", suspended: true, reason: "x", resumeAt: past }, ADMIN)).status).toBe(400);
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await control({ scope: "global", method: "bank", suspended: true, reason: "maintenance", resumeAt: future }, ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.resumeAt).toBeTruthy();
    // Suspending again the same target within 24h → the notification is deduplicated.
    await control({ scope: "global", method: "bank", suspended: false }, ADMIN);
    await control({ scope: "global", method: "bank", suspended: true, reason: "again", resumeAt: future }, ADMIN);
    expect(await prisma.notification.count({ where: { kind: "payment_method.suspended", targetId: res.body.data.id } })).toBe(1);

    expect((await read(await cron(new Request(BASE + "/api/cron/payment-method-controls"), {}))).status).toBe(401);
    const early = await read(await cron(new Request(BASE + "/api/cron/payment-method-controls", { headers: { authorization: "Bearer s3cret" } }), {}));
    expect(early.body.data.resumed).toBe(0);
    await prisma.paymentMethodControl.update({ where: { id: res.body.data.id }, data: { resumeAt: new Date(Date.now() - 1000) } });
    const late = await read(await cron(new Request(BASE + "/api/cron/payment-method-controls", { headers: { authorization: "Bearer s3cret" } }), {}));
    expect(late.body.data.resumed).toBe(1);
    const row = await prisma.paymentMethodControl.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row).toMatchObject({ suspended: false, resumeAt: null });
    expect(row.resumedAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { kind: "payment_method.resumed" } })).toBe(1);
    vi.unstubAllEnvs();
  });
});
