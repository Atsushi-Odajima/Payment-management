// Phase M: customer master (linking at creation and by backfill, payment
// tokens), personal-data masking (loaders, search, CSV modes, audit
// snapshots), the audited unmask action, manual anonymisation (admin, reason)
// and the retention job (idle customers, orphan transactions, audit pruning).

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as createPayment } from "@/app/api/payments/route";
import { GET as listCustomers } from "@/app/api/customers/route";
import { GET as getCustomer } from "@/app/api/customers/[id]/route";
import { POST as anonymize } from "@/app/api/customers/[id]/anonymize/route";
import { POST as unmask } from "@/app/api/pii/unmask/route";
import { GET as cronAnonymize } from "@/app/api/cron/anonymize/route";
import { GET as listSubscriptions } from "@/app/api/subscriptions/route";
import { PUT as putGlobal } from "@/app/api/global-settings/route";
import { linkExistingPayments, runRetention } from "@/lib/customers/service";
import { maskCustomerFields, maskDeep, maskEmail, maskIp, maskName, maskPhone } from "@/lib/pii/mask";
import { redactForAudit, systemAuditContext } from "@/lib/audit";
import { searchAll } from "@/lib/search";
import { loadTransactionDetail } from "@/lib/payments/detail";
import { DEFAULT_GLOBAL_SETTINGS } from "@/lib/settings/global";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let ADMIN: Record<string, string> = {};
let ACCOUNTING: Record<string, string> = {};
let CS: Record<string, string> = {};
let VIEWER: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = ADMIN) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
  ACCOUNTING = await sessionHeaders("accounting");
  CS = await sessionHeaders("cs");
  VIEWER = await sessionHeaders("viewer");
});

describe("masking helpers", () => {
  it("masks names, e-mails, phones and IPs and leaves everything else alone", () => {
    expect(maskName("山田 太郎")).toBe("山田 ＊＊");
    expect(maskName("Taro Yamada")).toBe("Taro ＊＊");
    expect(maskName("太郎")).toBe("太＊＊");
    expect(maskName(null)).toBeNull();
    expect(maskEmail("taro@example.com")).toBe("ta***@example.com");
    expect(maskEmail("bad")).toBe("***");
    expect(maskPhone("090-1234-5678")).toBe("***-****-5678");
    expect(maskIp("203.0.113.42")).toBe("203.0.113.***");
    expect(maskIp("2001:db8::1")).toBe("2001:***");
    expect(maskCustomerFields({ customerName: "山田 太郎", customerEmail: "taro@example.com", clientIp: "203.0.113.42", amount: 1 }, "masked")).toEqual({ customerName: "山田 ＊＊", customerEmail: "ta***@example.com", clientIp: "203.0.113.***", amount: 1 });
    expect(maskCustomerFields({ customerName: "山田 太郎" }, "full").customerName).toBe("山田 太郎");
    expect(maskDeep({ nested: { payerName: "佐藤 花子", email: "hanako@example.com", amount: 500 }, list: [{ clientIp: "10.0.0.9" }] })).toEqual({ nested: { payerName: "佐藤 ＊＊", email: "ha***@example.com", amount: 500 }, list: [{ clientIp: "10.0.0.***" }] });
    // Audit snapshots are masked at write time (secrets still redacted).
    expect(redactForAudit({ customerName: "山田 太郎", customerEmail: "taro@example.com", password: "x", amount: 3 })).toEqual({ customerName: "山田 ＊＊", customerEmail: "ta***@example.com", password: "[redacted]", amount: 3 });
  });
});

describe("M-1 customer master", () => {
  it("links seeded transactions to customers idempotently and stores the demo token / anonymised sample", async () => {
    const c1 = await prisma.customer.findUniqueOrThrow({ where: { merchantId_externalId: { merchantId: SEED_IDS.merchant1, externalId: "u_10021" } }, include: { tokens: true, _count: { select: { payments: true } } } });
    expect(c1.name).toBe("山田 太郎");
    expect(c1.phone).toBe("090-1234-5678");
    expect(c1.tokens).toHaveLength(1);
    expect(c1.tokens[0]).toMatchObject({ brand: "visa", last4: "4242" });
    expect(c1._count.payments).toBeGreaterThanOrEqual(2);
    expect(await prisma.payment.count({ where: { merchantId: { not: null }, customerId: { not: null }, customerRef: null } })).toBe(0);
    // Running the backfill again changes nothing.
    const before = await prisma.customer.count();
    expect(await linkExistingPayments(prisma)).toEqual({ linked: 0, customers: 0 });
    expect(await prisma.customer.count()).toBe(before);
    const anon = await prisma.customer.findUniqueOrThrow({ where: { id: SEED_IDS.customerAnonymized } });
    expect(anon.anonymizedAt).not.toBeNull();
    expect(anon.name).toBeNull();
  });

  it("creates / refreshes the customer and card token when a transaction is created", async () => {
    const body = { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant2, orderNumber: "CUS-NEW-1", amount: 1200, customerId: "u_new_1", customerName: "新規 顧客", customerEmail: "new@example.com", productName: "x", card: { brand: "mastercard", last4: "5100", expiry: "01/29" } };
    const first = await read(await createPayment(json("/api/payments", "POST", body), {}));
    expect(first.status).toBe(201);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { merchantId_externalId: { merchantId: SEED_IDS.merchant2, externalId: "u_new_1" } }, include: { tokens: true } });
    expect(customer.email).toBe("new@example.com");
    expect(customer.tokens).toHaveLength(1);
    expect(customer.tokens[0]).toMatchObject({ brand: "mastercard", last4: "5100", expiry: "01/29" });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: first.body.data.id } })).customerRef).toBe(customer.id);
    // Same customer, same card, new e-mail → refreshed, one token, lastUsedAt bumped.
    const second = await read(await createPayment(json("/api/payments", "POST", { ...body, orderNumber: "CUS-NEW-2", customerEmail: "new2@example.com" }), {}));
    expect(second.status).toBe(201);
    const again = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id }, include: { tokens: true, _count: { select: { payments: true } } } });
    expect(again.email).toBe("new2@example.com");
    expect(again.tokens).toHaveLength(1);
    expect(again._count.payments).toBe(2);
    // A second card adds a token; an anonymised customer that transacts again is revived.
    await prisma.customer.update({ where: { id: customer.id }, data: { anonymizedAt: NOW, anonymizeReason: "test", name: null } });
    const third = await read(await createPayment(json("/api/payments", "POST", { ...body, orderNumber: "CUS-NEW-3", card: { brand: "visa", last4: "0002", expiry: "02/29" } }), {}));
    expect(third.status).toBe(201);
    const revived = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id }, include: { tokens: true } });
    expect(revived.anonymizedAt).toBeNull();
    expect(revived.name).toBe("新規 顧客");
    expect(revived.tokens).toHaveLength(2);
  });

  it("lists and reads customers masked, filters by merchant / query / anonymised and needs no login for reads", async () => {
    const list = await read(await listCustomers(json("/api/customers?merchant=" + SEED_IDS.merchant1, "GET", undefined, {}), {}));
    expect(list.status).toBe(200);
    const taro = list.body.data.customers.find((c: any) => c.externalId === "u_10021");
    expect(taro).toMatchObject({ name: "山田 ＊＊", email: "ta***@example.com", phone: "***-****-5678", tokenCount: 1 });
    expect(list.body.data.customers.every((c: any) => c.merchant.id === SEED_IDS.merchant1)).toBe(true);
    const byQuery = await read(await listCustomers(json("/api/customers?q=u_100", "GET", undefined, {}), {}));
    expect(byQuery.body.data.customers.every((c: any) => c.externalId.includes("u_100"))).toBe(true);
    const anonymised = await read(await listCustomers(json("/api/customers?anonymized=yes", "GET", undefined, {}), {}));
    expect(anonymised.body.data.customers.map((c: any) => c.id)).toEqual([SEED_IDS.customerAnonymized]);
    const detail = await read(await getCustomer(json(`/api/customers/${taro.id}`, "GET", undefined, VIEWER), { params: { id: taro.id } }));
    expect(detail.status).toBe(200);
    expect(detail.body.data.name).toBe("山田 ＊＊");
    expect(detail.body.data.tokens[0].last4).toBe("4242");
    expect(detail.body.data.payments.length).toBeGreaterThanOrEqual(2);
    expect((await read(await getCustomer(json("/api/customers/nope", "GET", undefined, {}), { params: { id: "nope" } }))).status).toBe(404);
  });

  it("masks personal data in the transaction detail, global search and audit snapshots", async () => {
    const detail = await loadTransactionDetail(SEED_IDS.payment1);
    expect(detail?.customerRef).not.toBeNull();
    // The loader keeps full values; pages mask before rendering.
    expect(maskCustomerFields(detail!, "masked").customerName).toBe("山田 ＊＊");
    const found = await searchAll("taro@example.com");
    expect(found.customers.length).toBeGreaterThanOrEqual(1);
    expect(found.customers[0].email).toBe("ta***@example.com");
    expect(found.payments.every((p) => p.customerEmail === null || p.customerEmail!.includes("***"))).toBe(true);
    expect(found.customers.some((c) => c.name?.includes("＊＊"))).toBe(true);
  });
});

describe("M-2 unmask, CSV modes, anonymisation and retention", () => {
  it("reveals the real values only for admin / cs and writes pii.unmask per call", async () => {
    const taro = await prisma.customer.findUniqueOrThrow({ where: { merchantId_externalId: { merchantId: SEED_IDS.merchant1, externalId: "u_10021" } } });
    const cs = await read(await unmask(json("/api/pii/unmask", "POST", { targetType: "customer", id: taro.id }, CS), {}));
    expect(cs.status).toBe(200);
    expect(cs.body.data.fields).toEqual({ name: "山田 太郎", email: "taro@example.com", phone: "090-1234-5678" });
    const payment = await read(await unmask(json("/api/pii/unmask", "POST", { targetType: "payment", id: SEED_IDS.payment1 }), {}));
    expect(payment.body.data.fields.customerName).toBe("山田 太郎");
    expect((await read(await unmask(json("/api/pii/unmask", "POST", { targetType: "customer", id: taro.id }, ACCOUNTING), {}))).status).toBe(403);
    expect((await read(await unmask(json("/api/pii/unmask", "POST", { targetType: "customer", id: taro.id }, VIEWER), {}))).status).toBe(403);
    expect((await read(await unmask(json("/api/pii/unmask", "POST", { targetType: "customer", id: taro.id }, {}), {}))).status).toBe(401);
    expect((await read(await unmask(json("/api/pii/unmask", "POST", { targetType: "customer", id: "nope" }), {}))).status).toBe(404);
    const logs = await prisma.auditLog.findMany({ where: { action: "pii.unmask" }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ actorType: "admin", targetType: "customer", targetId: taro.id });
    expect(JSON.parse(logs[0].after!)).toMatchObject({ fields: ["name", "email", "phone"] });
    expect(logs[0].after).not.toContain("taro@example.com");
  });

  it("exports CSV masked by default and full only for admin / accounting when the setting allows", async () => {
    const csv = async (headers: Record<string, string>) => (await listSubscriptions(json("/api/subscriptions?format=csv&mode=test", "GET", undefined, headers), {})).text();
    const customersCsv = async (headers: Record<string, string>) => (await listCustomers(json("/api/customers?format=csv", "GET", undefined, headers), {})).text();
    expect(await csv(ADMIN)).toContain("山田 ＊＊");
    expect(await csv(ADMIN)).not.toContain("山田 太郎");
    expect(await customersCsv(ADMIN)).toContain("ta***@example.com");
    expect(await customersCsv(ADMIN)).not.toContain("taro@example.com");
    const settings = { ...DEFAULT_GLOBAL_SETTINGS, csvPii: "full" as const };
    expect((await read(await putGlobal(json("/api/global-settings", "PUT", settings), {}))).status).toBe(200);
    expect(await csv(ADMIN)).toContain("山田 太郎");
    expect(await csv(ACCOUNTING)).toContain("山田 太郎");
    expect(await csv(CS)).not.toContain("山田 太郎");
    expect(await customersCsv(ACCOUNTING)).toContain("taro@example.com");
    expect(await customersCsv(CS)).toContain("ta***@example.com");
    expect(await customersCsv(CS)).not.toContain("taro@example.com");
    // Retention settings are validated.
    expect((await read(await putGlobal(json("/api/global-settings", "PUT", { ...settings, piiRetentionMonths: 0 }), {}))).status).toBe(400);
    expect((await read(await putGlobal(json("/api/global-settings", "PUT", { ...settings, auditRetentionYears: 31 }), {}))).status).toBe(400);
  });

  it("anonymises a customer manually (admin, reason required) and refuses a second run", async () => {
    const taro = await prisma.customer.findUniqueOrThrow({ where: { merchantId_externalId: { merchantId: SEED_IDS.merchant1, externalId: "u_10021" } } });
    expect((await read(await anonymize(json(`/api/customers/${taro.id}/anonymize`, "POST", { reason: "request" }, CS), { params: { id: taro.id } }))).status).toBe(403);
    expect((await read(await anonymize(json(`/api/customers/${taro.id}/anonymize`, "POST", { reason: "" }), { params: { id: taro.id } }))).status).toBe(400);
    const res = await read(await anonymize(json(`/api/customers/${taro.id}/anonymize`, "POST", { reason: "Deletion request from the customer" }), { params: { id: taro.id } }));
    expect(res.status).toBe(200);
    expect(res.body.data.tokens).toBe(1);
    expect(res.body.data.payments).toBeGreaterThanOrEqual(2);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: taro.id }, include: { tokens: true, payments: true } });
    expect(after).toMatchObject({ name: null, email: null, phone: null, anonymizeReason: "Deletion request from the customer" });
    expect(after.anonymizedAt).not.toBeNull();
    expect(after.tokens).toHaveLength(0);
    expect(after.payments.every((p) => p.customerName === null && p.customerEmail === null && p.clientIp === null && p.cardHash === null)).toBe(true);
    // Ledger data stays.
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment1 } })).amount).toBeGreaterThan(0);
    const batch = await prisma.anonymizeBatch.findUniqueOrThrow({ where: { id: res.body.data.batchId } });
    expect(batch).toMatchObject({ kind: "manual", customers: 1, note: "Deletion request from the customer" });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "pii.anonymize", targetId: taro.id } });
    expect(JSON.parse(log.after!).reason).toBe("Deletion request from the customer");
    expect((await read(await anonymize(json(`/api/customers/${taro.id}/anonymize`, "POST", { reason: "again" }), { params: { id: taro.id } }))).status).toBe(409);
  });

  it("retention job anonymises idle customers and orphan transactions, prunes old audit rows and notifies", async () => {
    // Nothing is older than the default retention in the seed: the job is a no-op without a batch row.
    const idle = await runRetention(prisma, systemAuditContext("cron"), NOW);
    expect(idle.customers).toBe(0);
    expect(idle.batchId).toBeNull();
    // Age one customer (and its transactions) past the retention, add an orphan transaction and an old audit row.
    const old = new Date("2024-01-01T00:00:00Z");
    const taro = await prisma.customer.findUniqueOrThrow({ where: { merchantId_externalId: { merchantId: SEED_IDS.merchant1, externalId: "u_10021" } } });
    await prisma.customer.update({ where: { id: taro.id }, data: { createdAt: old } });
    await prisma.payment.updateMany({ where: { customerRef: taro.id }, data: { createdAt: old } });
    await prisma.payment.update({ where: { id: SEED_IDS.payment4 }, data: { customerRef: null, createdAt: old, customerEmail: "orphan@example.com" } });
    await prisma.auditLog.create({ data: { actorType: "system", action: "payment.create", targetType: "payment", targetId: "x", createdAt: new Date("2018-01-01T00:00:00Z") } });
    const auditBefore = await prisma.auditLog.count();
    const result = await runRetention(prisma, systemAuditContext("cron"), NOW);
    expect(result).toMatchObject({ customers: 1, tokens: 1, auditLogs: 1, retentionMonths: 24, auditRetentionYears: 7 });
    expect(result.payments).toBeGreaterThanOrEqual(3);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: taro.id }, include: { tokens: true } });
    expect(after.anonymizedAt).toEqual(NOW);
    expect(after.anonymizeReason).toBeNull();
    expect(after.tokens).toHaveLength(0);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment4 } })).customerEmail).toBeNull();
    // Other (recent) customers are untouched.
    expect(await prisma.customer.count({ where: { anonymizedAt: null } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { createdAt: { lt: new Date("2019-01-01T00:00:00Z") } } })).toBe(0);
    expect(await prisma.auditLog.count()).toBe(auditBefore - 1 + 2); // pruned one, wrote pii.anonymize_batch + audit_log.prune
    const batch = await prisma.anonymizeBatch.findUniqueOrThrow({ where: { id: result.batchId! } });
    expect(batch).toMatchObject({ kind: "retention", customers: 1, auditLogs: 1 });
    expect(await prisma.notification.count({ where: { kind: "pii.anonymized", targetId: result.batchId! } })).toBe(1);
    // The cron route: CRON_SECRET required.
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-test";
    try {
      expect((await read(await cronAnonymize(new Request(BASE + "/api/cron/anonymize"), {}))).status).toBe(401);
      const ok = await read(await cronAnonymize(new Request(BASE + "/api/cron/anonymize", { headers: { authorization: "Bearer cron-test" } }), {}));
      expect(ok.status).toBe(200);
      expect(ok.body.data.customers).toBe(0);
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });
});
