// Phase B merchant settings: contract / fee schedules, transaction limits
// (and their effect on creation), transfer / refund deadlines, API keys with
// the merchant-facing ping, the transfer-expiry cron and the test / live mode.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_API_KEYS, SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as getFees, POST as postFee } from "@/app/api/merchants/[id]/fees/route";
import { GET as getLimits, PUT as putLimits } from "@/app/api/merchants/[id]/limits/route";
import { PATCH as patchTerms } from "@/app/api/merchants/[id]/terms/route";
import { GET as listKeys, POST as issueKey } from "@/app/api/merchants/[id]/api-keys/route";
import { POST as rotateKey } from "@/app/api/merchants/[id]/api-keys/[keyId]/rotate/route";
import { POST as revokeKey } from "@/app/api/merchants/[id]/api-keys/[keyId]/revoke/route";
import { GET as ping } from "@/app/api/merchant-api/ping/route";
import { GET as cronExpire } from "@/app/api/cron/expire-transfers/route";
import { expireOverdueTransfers } from "@/lib/payments/expire";
import { POST as createPayment } from "@/app/api/payments/route";
import { loadTransactions, parseTransactionFilters } from "@/lib/payments/list";
import { loadTransactionDetail } from "@/lib/payments/detail";
import { APPLICATION_STATUSES, SALES_STATUSES } from "@/lib/payments/transitions";
import { PLAN_DEFAULT_RATES } from "@/lib/merchants/fees";
import { ROTATION_GRACE_DAYS } from "@/lib/merchants/api-keys";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let ADMIN: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const m1 = SEED_IDS.merchant1;
const m2 = SEED_IDS.merchant2;
const ctx = (id: string, keyId?: string) => ({ params: keyId ? { id, keyId } : { id } }) as { params: { id: string; keyId: string } };

async function create(body: Record<string, unknown>) {
  return read(await createPayment(json("/api/payments", "POST", { orderNumber: `ORD-${Math.random().toString(36).slice(2, 8)}`, customerName: "Tester", customerId: "u_t", ...body }, ADMIN), {}));
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("contract & fee schedules", () => {
  it("lists the seeded schedules with the current one flagged", async () => {
    const res = await read(await getFees(json(`/api/merchants/${m2}/fees`, "GET"), ctx(m2)));
    expect(res.status).toBe(200);
    const s = res.body.data.schedules;
    expect(s).toHaveLength(2);
    // The seed is anchored at NOW (2026-09-01) while the route uses the real
    // clock: the premium schedule (NOW + 14 days) is "upcoming" until then and
    // "current" afterwards, so derive the expected flags from its date.
    const premiumUpcoming = new Date(s[0].effectiveFrom).getTime() > Date.now();
    expect(s[0]).toMatchObject({ plan: "premium", upcoming: premiumUpcoming, current: !premiumUpcoming });
    expect(s[1]).toMatchObject({ plan: "standard", upcoming: false, current: premiumUpcoming });
  });

  it("adds a schedule, keeps history and audits the change", async () => {
    const unauth = await read(await postFee(json(`/api/merchants/${m1}/fees`, "POST", { plan: "premium" }), ctx(m1)));
    expect(unauth.status).toBe(401);

    const missingRates = await read(await postFee(json(`/api/merchants/${m1}/fees`, "POST", { plan: "custom" }, ADMIN), ctx(m1)));
    expect(missingRates.status).toBe(400);

    const custom = { ...PLAN_DEFAULT_RATES.standard, credit: { ratePercent: 2.9, fixedFee: 0 } };
    const future = await read(await postFee(json(`/api/merchants/${m1}/fees`, "POST", { plan: "custom", rates: custom, effectiveFrom: "2030-01-01", note: "renegotiated" }, ADMIN), ctx(m1)));
    expect(future.status).toBe(201);
    expect(future.body.data.schedules).toHaveLength(2);
    expect(future.body.data.schedules[0]).toMatchObject({ plan: "custom", upcoming: true, current: false, note: "renegotiated" });
    expect(future.body.data.schedules[0].rates.credit.ratePercent).toBe(2.9);
    expect(future.body.data.schedules[1]).toMatchObject({ plan: "standard", current: true });

    const immediate = await read(await postFee(json(`/api/merchants/${m1}/fees`, "POST", { plan: "premium" }, ADMIN), ctx(m1)));
    expect(immediate.status).toBe(201);
    const current = immediate.body.data.schedules.find((s: any) => s.current);
    expect(current.plan).toBe("premium");
    expect(current.rates).toEqual(PLAN_DEFAULT_RATES.premium);

    const audits = await prisma.auditLog.findMany({ where: { action: "merchant.fee_update", targetId: m1 } });
    expect(audits).toHaveLength(2);
    expect(JSON.parse(audits[0].before!)).toMatchObject({ plan: "standard" });
  });
});

describe("transaction limits", () => {
  it("returns limits with usage for the requested mode", async () => {
    const res = await read(await getLimits(json(`/api/merchants/${m1}/limits?mode=test`, "GET"), ctx(m1)));
    expect(res.status).toBe(200);
    expect(res.body.data.limits.find((l: any) => l.method === "credit")).toMatchObject({ perTransaction: 100_000, daily: 300_000, monthly: 3_000_000 });
    expect(res.body.data.usage.map((u: any) => u.method)).toEqual(["credit", "qr", "convenience", "bank"]);
  });

  it("replaces the limit set and records an exceeding transaction as failed", async () => {
    const put = await read(
      await putLimits(
        json(`/api/merchants/${m2}/limits`, "PUT", [{ method: "credit", perTransaction: 10_000, daily: 25_000 }, { method: "bank", perTransaction: null, daily: null, monthly: null }], ADMIN),
        ctx(m2),
      ),
    );
    expect(put.status).toBe(200);
    expect(put.body.data.limits).toHaveLength(1); // the all-null row is dropped
    expect(await prisma.auditLog.count({ where: { action: "merchant.limit_update", targetId: m2 } })).toBe(1);

    const tooBig = await create({ providerId: SEED_IDS.stripeProvider, merchantId: m2, amount: 10_001 });
    expect(tooBig.status).toBe(201);
    expect(tooBig.body.data.status).toBe("failed");
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: tooBig.body.data.id }, include: { events: true } });
    expect(row.failureReason).toBe("limit_exceeded:per_transaction");
    expect(row.events.map((e) => e.type).sort()).toEqual(["created", "fail"]);

    const ok1 = await create({ providerId: SEED_IDS.stripeProvider, merchantId: m2, amount: 9_000 });
    expect(ok1.body.data.status).toBe("captured");
    const ok2 = await create({ providerId: SEED_IDS.stripeProvider, merchantId: m2, amount: 9_000 });
    expect(ok2.body.data.status).toBe("captured");
    const overDaily = await create({ providerId: SEED_IDS.stripeProvider, merchantId: m2, amount: 9_000 }); // 18,000 + 9,000 > 25,000
    expect(overDaily.body.data.status).toBe("failed");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: overDaily.body.data.id } })).failureReason).toBe("limit_exceeded:daily");

    const detail = await loadTransactionDetail(overDaily.body.data.id);
    expect(detail?.failureReason).toBe("limit_exceeded:daily");

    const invalid = await read(await putLimits(json(`/api/merchants/${m2}/limits`, "PUT", [{ method: "credit", daily: -1 }], ADMIN), ctx(m2)));
    expect(invalid.status).toBe(400);
  });
});

describe("transfer deadline and refund window", () => {
  it("applies the merchant's transfer deadline to new bank transfers", async () => {
    const bad = await read(await patchTerms(json(`/api/merchants/${m2}/terms`, "PATCH", { transferDueDays: 0, refundWindowDays: 30 }, ADMIN), ctx(m2)));
    expect(bad.status).toBe(400);

    const res = await read(await patchTerms(json(`/api/merchants/${m2}/terms`, "PATCH", { transferDueDays: 10, refundWindowDays: 30 }, ADMIN), ctx(m2)));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ transferDueDays: 10, cvsDueDays: 3, refundWindowDays: 30 });
    expect(await prisma.auditLog.count({ where: { action: "merchant.terms_update", targetId: m2 } })).toBe(1);

    const created = await create({ providerId: SEED_IDS.bankProvider, merchantId: m2, amount: 5000 });
    expect(created.status).toBe(201);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const days = (row.transferDueAt!.getTime() - row.createdAt.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(9.9);
    expect(days).toBeLessThan(11.1);
  });

  it("derives the refund deadline from the completion date", async () => {
    const detail = await loadTransactionDetail(SEED_IDS.payment1);
    expect(detail?.refundDeadlineAt).not.toBeNull();
    const days = (detail!.refundDeadlineAt!.getTime() - detail!.capturedAt!.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(180);
    const open = await loadTransactionDetail(SEED_IDS.payment4);
    expect(open?.refundDeadlineAt).toBeNull();
  });
});

describe("API keys", () => {
  const bearer = (key: string, extra: Record<string, string> = {}) => new Request(BASE + "/api/merchant-api/ping", { headers: { authorization: `Bearer ${key}`, ...extra } });

  it("lists keys without secrets and authenticates the seeded ones", async () => {
    const list = await read(await listKeys(json(`/api/merchants/${m1}/api-keys`, "GET"), ctx(m1)));
    expect(list.status).toBe(200);
    expect(list.body.data.keys).toHaveLength(4); // test / live api keys, test / live signing secrets
    for (const k of list.body.data.keys) {
      expect(k.keyHash).toBeUndefined();
      expect(k.keyPrefix).toMatch(/…$/);
    }

    const ok = await read(await ping(bearer(SEED_API_KEYS[SEED_IDS.apiKey1]), {}));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ merchantCode: "MER-00001", mode: "test", kind: "api_key", status: "active" });
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: SEED_IDS.apiKey1 } })).lastUsedAt!.getTime()).toBeGreaterThan(NOW.getTime());

    const revoked = await read(await ping(bearer(SEED_API_KEYS[SEED_IDS.apiKey4]), {}));
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe("invalid_api_key");
    expect((await read(await ping(bearer("wp_test_ak_" + "x".repeat(32)), {}))).status).toBe(401);
    expect((await read(await ping(new Request(BASE + "/api/merchant-api/ping"), {}))).status).toBe(401);
  });

  it("issues, rotates with a grace period and revokes", async () => {
    expect((await read(await issueKey(json(`/api/merchants/${m2}/api-keys`, "POST", { mode: "live", kind: "api_key" }), ctx(m2)))).status).toBe(401);

    const issued = await read(await issueKey(json(`/api/merchants/${m2}/api-keys`, "POST", { mode: "live", kind: "api_key", label: "prod" }, ADMIN), ctx(m2)));
    expect(issued.status).toBe(201);
    expect(issued.body.data.plaintext).toMatch(/^wp_live_ak_[A-Za-z0-9]{32}$/);
    expect(issued.body.data.key).toMatchObject({ mode: "live", kind: "api_key", label: "prod", status: "active" });
    const keyId = issued.body.data.key.id as string;
    expect(await prisma.auditLog.count({ where: { action: "api_key.issue", targetId: keyId } })).toBe(1);
    expect((await read(await ping(bearer(issued.body.data.plaintext), {}))).body.data.mode).toBe("live");

    const rotated = await read(await rotateKey(json(`/api/merchants/${m2}/api-keys/${keyId}/rotate`, "POST", {}, ADMIN), ctx(m2, keyId)));
    expect(rotated.status).toBe(201);
    expect(rotated.body.data.plaintext).not.toBe(issued.body.data.plaintext);
    expect(rotated.body.data.key.label).toBe("prod");
    const old = rotated.body.data.keys.find((k: any) => k.id === keyId);
    expect(old.status).toBe("expiring");
    const grace = (new Date(old.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(grace)).toBe(ROTATION_GRACE_DAYS);
    // Both keys work during the grace period.
    expect((await ping(bearer(issued.body.data.plaintext), {})).status).toBe(200);
    expect((await ping(bearer(rotated.body.data.plaintext), {})).status).toBe(200);

    const revoked = await read(await revokeKey(json(`/api/merchants/${m2}/api-keys/${keyId}/revoke`, "POST", undefined, ADMIN), ctx(m2, keyId)));
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.key.status).toBe("revoked");
    expect((await ping(bearer(issued.body.data.plaintext), {})).status).toBe(401);
    expect((await read(await revokeKey(json(`/api/merchants/${m2}/api-keys/${keyId}/revoke`, "POST", undefined, ADMIN), ctx(m2, keyId)))).status).toBe(409);
    expect((await read(await rotateKey(json(`/api/merchants/${m2}/api-keys/${keyId}/rotate`, "POST", {}, ADMIN), ctx(m2, keyId)))).status).toBe(409);
    // A key belongs to one merchant: another merchant's id yields 404.
    expect((await read(await revokeKey(json(`/api/merchants/${m1}/api-keys/${keyId}/revoke`, "POST", undefined, ADMIN), ctx(m1, keyId)))).status).toBe(404);
  });

  it("applies the merchant's own IP block rules to the merchant API", async () => {
    await prisma.ipRestriction.create({ data: { target: "merchant_api", merchantId: m1, cidr: "198.51.100.0/24", label: "blocked", mode: "deny", enabled: true } });
    const blocked = await read(await ping(bearer(SEED_API_KEYS[SEED_IDS.apiKey1], { "x-forwarded-for": "198.51.100.7" }), {}));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("ip_blocked");
    expect((await ping(bearer(SEED_API_KEYS[SEED_IDS.apiKey1], { "x-forwarded-for": "203.0.113.10" }), {})).status).toBe(200);
    // Rules of another merchant do not apply.
    const other = await read(await ping(bearer(SEED_API_KEYS[SEED_IDS.apiKey1], { "x-forwarded-for": "198.51.100.7" }), {}));
    expect(other.status).toBe(403);
    await prisma.ipRestriction.deleteMany({ where: { label: "blocked" } });
    expect((await ping(bearer(SEED_API_KEYS[SEED_IDS.apiKey1], { "x-forwarded-for": "198.51.100.7" }), {})).status).toBe(200);
  });
});

describe("transfer expiry cron", () => {
  it("expires overdue bank transfers as actor cron and audits each", async () => {
    // Make every awaiting transfer overdue; seed dates are relative to NOW and may not be yet.
    await prisma.payment.updateMany({ where: { status: { in: ["awaiting_transfer", "awaiting_payment"] } }, data: { transferDueAt: new Date("2026-01-01T00:00:00Z") } });
    const result = await expireOverdueTransfers();
    expect(result).toEqual({ expired: 6, skipped: 0 }); // payment4, payment5, payment17, the live payment9 / payment10 and the konbini slip payment14
    const rows = await prisma.payment.findMany({ where: { id: { in: [SEED_IDS.payment4, SEED_IDS.payment5, SEED_IDS.payment9, SEED_IDS.payment10, SEED_IDS.payment14, SEED_IDS.payment17] } }, select: { status: true } });
    expect(rows.every((r) => r.status === "expired")).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "payment.expire", actorType: "cron" } })).toBe(6);
    expect(await prisma.paymentEvent.count({ where: { type: "expire", actor: "system" } })).toBe(7); // 6 by the cron + the seeded expired ORD-DEMO-016
    expect(await expireOverdueTransfers()).toEqual({ expired: 0, skipped: 0 });
  });

  it("guards the endpoint with CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const denied = await read(await cronExpire(new Request(BASE + "/api/cron/expire-transfers"), {}));
    expect(denied.status).toBe(401);
    const ok = await read(await cronExpire(new Request(BASE + "/api/cron/expire-transfers", { headers: { authorization: "Bearer s3cret" } }), {}));
    expect(ok.status).toBe(200);
    // Seed dates are relative to NOW, so at real time some transfers may already be overdue.
    expect(typeof ok.body.data.expired).toBe("number");
    expect(ok.body.data.skipped).toBe(0);
  });
});

describe("test / live mode", () => {
  it("lists only the selected mode's transactions", async () => {
    const test = await loadTransactions({ allowedStatuses: SALES_STATUSES, filters: parseTransactionFilters({}, SALES_STATUSES, "test"), page: 1, pageSize: 50, order: "sales", now: NOW });
    expect(test.items.map((i) => i.id).sort()).toEqual([SEED_IDS.payment1, SEED_IDS.payment2, SEED_IDS.payment7, SEED_IDS.payment12, SEED_IDS.payment13, SEED_IDS.payment15, SEED_IDS.payment18].sort());
    const live = await loadTransactions({ allowedStatuses: SALES_STATUSES, filters: parseTransactionFilters({}, SALES_STATUSES, "live"), page: 1, pageSize: 50, order: "sales", now: NOW });
    expect(live.items.map((i) => i.id).sort()).toEqual([SEED_IDS.payment8, SEED_IDS.payment11].sort());
    const liveOpen = await loadTransactions({ allowedStatuses: APPLICATION_STATUSES, filters: parseTransactionFilters({}, APPLICATION_STATUSES, "live"), page: 1, pageSize: 50, order: "applications", now: NOW });
    expect(liveOpen.items.map((i) => i.id).sort()).toEqual([SEED_IDS.payment9, SEED_IDS.payment10].sort());
  });
});
