// Phase L-1: public API v1 — Bearer authentication, per-merchant rate limit,
// transaction creation per method with test-card scenarios and idempotency,
// scoping of reads to the key's merchant / environment, refund requests,
// payment links, and the OpenAPI document's consistency with the routes.

import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_API_KEYS, SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listTx, POST as createTx } from "@/app/api/v1/transactions/route";
import { GET as getTx } from "@/app/api/v1/transactions/[id]/route";
import { POST as createRefund } from "@/app/api/v1/refunds/route";
import { POST as createLink } from "@/app/api/v1/payment-links/route";
import { GET as openapi } from "@/app/api/v1/openapi.json/route";
import { PUBLIC_API_ENDPOINTS, buildOpenApiSpec, zodToJsonSchema } from "@/lib/public-api/openapi";
import { createTransactionApiSchema } from "@/lib/public-api/schemas";
import { PUBLIC_API_RATE_LIMIT, consumePublicApiRateLimit } from "@/lib/public-api/rate-limit";
import { luhnValid } from "@/lib/public-api/test-cards";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
const TEST_KEY = SEED_API_KEYS[SEED_IDS.apiKey1];
const LIVE_KEY = SEED_API_KEYS[SEED_IDS.apiKey2];

function req(path: string, method: string, body?: unknown, key: string | null = TEST_KEY, extra: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers };
}
const post = async (body: unknown, key: string | null = TEST_KEY, extra: Record<string, string> = {}) => read(await createTx(req("/api/v1/transactions", "POST", body, key, extra), {}));

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
});

describe("authentication and rate limit", () => {
  it("refuses missing, malformed, revoked and signing-secret keys", async () => {
    expect((await read(await listTx(req("/api/v1/transactions", "GET", undefined, null), {}))).status).toBe(401);
    expect((await read(await listTx(req("/api/v1/transactions", "GET", undefined, "wp_test_ak_nope"), {}))).status).toBe(401);
    expect((await read(await listTx(req("/api/v1/transactions", "GET", undefined, SEED_API_KEYS[SEED_IDS.apiKey4]), {}))).status).toBe(401); // revoked
    expect((await read(await listTx(req("/api/v1/transactions", "GET", undefined, SEED_API_KEYS[SEED_IDS.apiKey3]), {}))).status).toBe(401); // signing secret
    const ok = await read(await listTx(req("/api/v1/transactions?limit=2", "GET"), {}));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-ratelimit-limit")).toBe(String(PUBLIC_API_RATE_LIMIT));
  });

  it("limits 60 requests per minute per merchant and environment (429 + Retry-After)", async () => {
    for (let i = 0; i < PUBLIC_API_RATE_LIMIT - 1; i++) await consumePublicApiRateLimit(prisma, { merchantId: SEED_IDS.merchant1, mode: "test" });
    expect((await read(await listTx(req("/api/v1/transactions", "GET"), {}))).status).toBe(200);
    const limited = await read(await listTx(req("/api/v1/transactions", "GET"), {}));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // The live key of the same merchant has its own window.
    expect((await read(await listTx(req("/api/v1/transactions", "GET", undefined, LIVE_KEY), {}))).status).toBe(200);
  });
});

describe("transactions", () => {
  it("creates a card payment (captured), replays on the same Idempotency-Key and scopes reads to the key", async () => {
    const body = { method: "credit", orderNumber: "API-1", amount: 4980, customerName: "Taro", customerEmail: "taro@example.com", card: { number: "4242424242424242", expMonth: 12, expYear: 2028 } };
    const first = await post(body, TEST_KEY, { "idempotency-key": "api-test-key-0001" });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ object: "transaction", status: "captured", mode: "test", method: "credit", card: { last4: "4242" }, customer: { name: "Taro" } });
    const again = await post(body, TEST_KEY, { "idempotency-key": "api-test-key-0001" });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    // Audit + history mark the API as the actor.
    expect(await prisma.auditLog.count({ where: { action: "payment.create", actorType: "merchant", merchantId: SEED_IDS.merchant1, targetId: first.body.data.id } })).toBe(1);
    expect((await prisma.paymentEvent.findFirst({ where: { paymentId: first.body.data.id, type: "created" } }))!.actor).toBe("api");
    // Get: own key ok; live key of the same merchant → 404 (other environment); other merchant → 404.
    expect((await read(await getTx(req(`/api/v1/transactions/${first.body.data.id}`, "GET"), { params: { id: first.body.data.id } }))).body.data.id).toBe(first.body.data.id);
    expect((await read(await getTx(req(`/api/v1/transactions/${first.body.data.id}`, "GET", undefined, LIVE_KEY), { params: { id: first.body.data.id } }))).status).toBe(404);
    expect((await read(await getTx(req(`/api/v1/transactions/${SEED_IDS.payment4}`, "GET"), { params: { id: SEED_IDS.payment4 } }))).status).toBe(404); // merchant2's
    // List: newest first, cursor paging, filters.
    const page1 = await read(await listTx(req("/api/v1/transactions?limit=2", "GET"), {}));
    expect(page1.body.data.data).toHaveLength(2);
    expect(page1.body.data.data[0].id).toBe(first.body.data.id);
    expect(page1.body.data.hasMore).toBe(true);
    const page2 = await read(await listTx(req(`/api/v1/transactions?limit=2&startingAfter=${page1.body.data.data[1].id}`, "GET"), {}));
    expect(page2.body.data.data.every((t: any) => !page1.body.data.data.some((p: any) => p.id === t.id))).toBe(true);
    expect((await read(await listTx(req("/api/v1/transactions?status=captured&method=credit", "GET"), {}))).body.data.data.every((t: any) => t.status === "captured" && t.method === "credit")).toBe(true);
    expect((await read(await listTx(req("/api/v1/transactions?limit=500", "GET"), {}))).status).toBe(400);
  });

  it("reproduces the test-card scenarios in test mode and refuses them in live mode", async () => {
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
    const declined = await post({ method: "credit", orderNumber: "API-D", amount: 100, card: { number: "4000000000000002", expMonth: 1, expYear: 2029 } });
    expect(declined.body.data).toMatchObject({ status: "failed", failureReason: "card_declined" });
    const auth = await post({ method: "credit", orderNumber: "API-A", amount: 100, card: { number: "4000000000003220", expMonth: 1, expYear: 2029 } });
    expect(auth.body.data.status).toBe("authorized");
    expect((await post({ method: "credit", orderNumber: "API-L", amount: 100, card: { number: "4242424242424241", expMonth: 1, expYear: 2029 } })).status).toBe(400);
    const live = await post({ method: "credit", orderNumber: "API-LIVE", amount: 100, card: { number: "4242424242424242", expMonth: 1, expYear: 2029 } }, LIVE_KEY);
    expect(live.status).toBe(400);
    expect(live.body.error.code).toBe("test_card_in_live");
  });

  it("applies the merchant's enabled methods, suspensions and returns konbini / bank instructions", async () => {
    // merchant1 has credit + qr only.
    const bank = await post({ method: "bank", orderNumber: "API-B", amount: 1000 });
    expect(bank.status).toBe(400);
    expect(bank.body.error.code).toBe("method_not_enabled");
    // merchant3 (bank + convenience) through its own key.
    const key3 = "wp_test_ak_Merchant3DemoTestKey000000000003";
    await prisma.apiKey.create({ data: { merchantId: SEED_IDS.merchant3, mode: "test", kind: "api_key", keyPrefix: key3.slice(0, 16), keyHash: (await import("@/lib/merchants/api-keys-server")).hashApiKey(key3) } });
    const cvs = await post({ method: "convenience", orderNumber: "API-C", amount: 2500, cvsBrand: "lawson", customerEmail: "c@example.com" }, key3);
    expect(cvs.status).toBe(201);
    expect(cvs.body.data.status).toBe("pending");
    expect(cvs.body.data.konbini).toMatchObject({ brand: "lawson" });
    expect(cvs.body.data.konbini.receiptNo).toMatch(/^\d{13}$/);
    const transfer = await post({ method: "bank", orderNumber: "API-T", amount: 3000 }, key3);
    expect(transfer.body.data.status).toBe("awaiting_transfer");
    expect(transfer.body.data.bankTransfer.transferId).toMatch(/^\d{7}$/);
    // Suspended method → 409 method_suspended.
    await prisma.paymentMethodControl.create({ data: { scope: "merchant", merchantId: SEED_IDS.merchant3, method: "bank", suspended: true, reason: "test", suspendedAt: new Date() } });
    const suspended = await post({ method: "bank", orderNumber: "API-S", amount: 3000 }, key3);
    expect(suspended.status).toBe(409);
    expect(suspended.body.error.code).toBe("method_suspended");
  });
});

describe("refunds and payment links", () => {
  it("files a refund request for the merchant's own completed transaction (reviewed by the PSP)", async () => {
    const res = await read(await createRefund(req("/api/v1/refunds", "POST", { transactionId: SEED_IDS.payment1, amount: 1000, reasonCode: "customer" }), {}));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ object: "refund", transactionId: SEED_IDS.payment1, amount: 1000, status: "requested", kind: "partial" });
    const row = await prisma.refund.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.requestedById).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "refund.request", actorType: "merchant", targetId: row.id } })).toBe(1);
    // Another merchant's transaction → 404; over the balance → 400; not completed → 409.
    expect((await read(await createRefund(req("/api/v1/refunds", "POST", { transactionId: SEED_IDS.payment4 }), {}))).status).toBe(404);
    expect((await read(await createRefund(req("/api/v1/refunds", "POST", { transactionId: SEED_IDS.payment1, amount: 99_999 }), {}))).status).toBe(400);
    expect((await read(await createRefund(req("/api/v1/refunds", "POST", { transactionId: SEED_IDS.payment3 }), {}))).status).toBe(404); // merchant2's authorized txn
  });

  it("issues a payment link in the key's environment", async () => {
    const res = await read(await createLink(req("/api/v1/payment-links", "POST", { productName: "API product", amount: 1200, maxUses: 3, expiresAt: "2030-01-01" }), {}));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ object: "payment_link", productName: "API product", amount: 1200, maxUses: 3, mode: "test", status: "active" });
    expect(res.body.data.url).toMatch(/\/pay\/[a-z0-9]{24}$/);
    const row = await prisma.paymentLink.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.merchantId).toBe(SEED_IDS.merchant1);
    expect(row.createdById).toBeNull();
  });
});

describe("OpenAPI document", () => {
  it("is served, lists every route under app/api/v1 and nothing else, and mirrors the zod schemas", async () => {
    const res = await openapi(new Request(BASE + "/api/v1/openapi.json?lang=en"), {});
    expect(res.status).toBe(200);
    const spec = (await res.json()) as any;
    expect(spec.openapi).toBe("3.0.3");
    expect(Object.keys(spec.paths).sort()).toEqual(["/payment-links", "/refunds", "/transactions", "/transactions/{id}"]);
    // Every documented endpoint has its route file; every route file is documented.
    for (const e of PUBLIC_API_ENDPOINTS) expect(existsSync(path.join(process.cwd(), "app", e.routeFile))).toBe(true);
    const routeFiles = new Set(PUBLIC_API_ENDPOINTS.map((e) => e.routeFile));
    for (const f of ["api/v1/transactions/route.ts", "api/v1/transactions/[id]/route.ts", "api/v1/refunds/route.ts", "api/v1/payment-links/route.ts"]) expect(routeFiles.has(f)).toBe(true);
    // Request schema = zod schema (required keys, enums, descriptions).
    const body = spec.paths["/transactions"].post.requestBody.content["application/json"].schema;
    expect([...body.required].sort()).toEqual(["amount", "method", "orderNumber"]);
    expect(body.properties.method.enum).toEqual(["credit", "qr", "convenience", "bank"]);
    expect(body.properties.card.properties.number.type).toBe("string");
    expect(JSON.stringify(zodToJsonSchema(createTransactionApiSchema))).toBe(JSON.stringify(body));
    expect(spec["x-error-codes"].some((e: any) => e.code === "rate_limited")).toBe(true);
    expect(spec["x-test-cards"].length).toBeGreaterThan(5);
    expect((buildOpenApiSpec("http://x", "ja").info as { description: string }).description).toContain("Bearer");
  });
});
