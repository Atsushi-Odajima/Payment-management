// Phase L-2: merchant portal — login with lockout, a session cookie that is
// not an operator session, refund requests, webhook resend, test-key
// rotation (live refused) and the invoice PDF, all scoped to the merchant.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, SEED_MERCHANT_PASSWORDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as login } from "@/app/api/merchant-portal/login/route";
import { POST as logout } from "@/app/api/merchant-portal/logout/route";
import { POST as refund } from "@/app/api/merchant-portal/refunds/route";
import { POST as resend } from "@/app/api/merchant-portal/webhooks/[id]/resend/route";
import { POST as rotate } from "@/app/api/merchant-portal/api-keys/[keyId]/rotate/route";
import { GET as invoice } from "@/app/api/merchant-portal/settlements/[id]/invoice/route";
import { POST as adminRefund } from "@/app/api/refunds/route";
import { MERCHANT_COOKIE, createMerchantToken, verifyMerchantToken } from "@/lib/merchant-portal/token";
import { MERCHANT_LOCKOUT_THRESHOLD } from "@/lib/merchant-portal/session";
import { verifySessionToken } from "@/lib/auth";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers };
}
async function cookieFor(merchantId: string): Promise<Record<string, string>> {
  return { cookie: `${MERCHANT_COOKIE}=${await createMerchantToken(merchantId)}` };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
});

describe("login", () => {
  it("issues a merchant cookie that is not an operator session, and locks after repeated failures", async () => {
    const ok = await read(await login(json("/api/merchant-portal/login", "POST", { merchantCode: "mer-00001", password: SEED_MERCHANT_PASSWORDS[SEED_IDS.merchant1] }), {}));
    expect(ok.status).toBe(200);
    expect(ok.body.data.merchant.merchantCode).toBe("MER-00001");
    const setCookie = ok.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${MERCHANT_COOKIE}=`);
    const token = /wirepay\.merchant=([^;]+)/.exec(setCookie)![1];
    expect((await verifyMerchantToken(token))?.sub).toBe(SEED_IDS.merchant1);
    expect(await verifySessionToken(token)).toBeNull(); // never accepted as an admin session
    expect(await prisma.auditLog.count({ where: { action: "merchant.login", actorType: "merchant", merchantId: SEED_IDS.merchant1 } })).toBe(1);
    expect((await prisma.merchant.findUniqueOrThrow({ where: { id: SEED_IDS.merchant1 } })).lastLoginAt).not.toBeNull();

    // Wrong password × threshold → locked (423), even with the right password afterwards.
    for (let i = 0; i < MERCHANT_LOCKOUT_THRESHOLD - 1; i++) {
      expect((await read(await login(json("/api/merchant-portal/login", "POST", { merchantCode: "MER-00002", password: "wrong" }), {}))).status).toBe(401);
    }
    const locked = await read(await login(json("/api/merchant-portal/login", "POST", { merchantCode: "MER-00002", password: "wrong" }), {}));
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe("merchant_locked");
    expect((await read(await login(json("/api/merchant-portal/login", "POST", { merchantCode: "MER-00002", password: SEED_MERCHANT_PASSWORDS[SEED_IDS.merchant2] }), {}))).status).toBe(423);
    expect(await prisma.auditLog.count({ where: { action: "merchant.lockout", merchantId: SEED_IDS.merchant2 } })).toBe(1);
    // Unknown merchant → same 401.
    expect((await read(await login(json("/api/merchant-portal/login", "POST", { merchantCode: "MER-99999", password: "x" }), {}))).status).toBe(401);
    // Logout clears the cookie and audits.
    const out = await read(await logout(json("/api/merchant-portal/logout", "POST", {}, { cookie: `${MERCHANT_COOKIE}=${token}` }), {}));
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await prisma.auditLog.count({ where: { action: "merchant.logout", merchantId: SEED_IDS.merchant1 } })).toBe(1);
  });
});

describe("portal actions", () => {
  it("requests refunds only for the merchant's own transactions and they reach the PSP review", async () => {
    const c1 = await cookieFor(SEED_IDS.merchant1);
    expect((await read(await refund(json("/api/merchant-portal/refunds", "POST", { paymentId: SEED_IDS.payment1, amount: 500, reasonCode: "defect", reason: "" }), {}))).status).toBe(401);
    const res = await read(await refund(json("/api/merchant-portal/refunds", "POST", { paymentId: SEED_IDS.payment1, amount: 500, reasonCode: "defect", reason: "" }, c1), {}));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("requested");
    expect((await read(await refund(json("/api/merchant-portal/refunds", "POST", { paymentId: SEED_IDS.payment4, amount: 500, reasonCode: "defect", reason: "" }, c1), {}))).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: "refund.request", actorType: "merchant", merchantId: SEED_IDS.merchant1 } })).toBe(1);
    // The dashboard sees it like any request (the admin route still works alongside).
    expect(await prisma.refund.count({ where: { merchantId: SEED_IDS.merchant1, status: "requested" } })).toBeGreaterThanOrEqual(2);
    void adminRefund;
  });

  it("re-sends the merchant's own webhook deliveries and refuses others", async () => {
    const c1 = await cookieFor(SEED_IDS.merchant1);
    const mine = await prisma.webhookDelivery.findFirstOrThrow({ where: { merchantId: SEED_IDS.merchant1 }, select: { id: true } });
    const theirs = await prisma.webhookDelivery.findFirstOrThrow({ where: { merchantId: { not: SEED_IDS.merchant1 } }, select: { id: true } });
    const own = await read(await resend(json(`/api/merchant-portal/webhooks/${mine.id}/resend`, "POST", {}, c1), { params: { id: mine.id } }));
    expect(own.status).toBe(200);
    expect(await prisma.webhookAttempt.count({ where: { deliveryId: mine.id, trigger: "dashboard" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "webhook.resend", actorType: "merchant", merchantId: SEED_IDS.merchant1, targetId: mine.id } })).toBe(1);
    const other = await read(await resend(json(`/api/merchant-portal/webhooks/${theirs.id}/resend`, "POST", {}, c1), { params: { id: theirs.id } }));
    expect(other.status).toBe(404);
  });

  it("rotates test keys only", async () => {
    const c1 = await cookieFor(SEED_IDS.merchant1);
    const ok = await read(await rotate(json(`/api/merchant-portal/api-keys/${SEED_IDS.apiKey1}/rotate`, "POST", {}, c1), { params: { keyId: SEED_IDS.apiKey1 } }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.plaintext).toMatch(/^wp_test_ak_/);
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: SEED_IDS.apiKey1 } })).expiresAt).not.toBeNull();
    const live = await read(await rotate(json(`/api/merchant-portal/api-keys/${SEED_IDS.apiKey2}/rotate`, "POST", {}, c1), { params: { keyId: SEED_IDS.apiKey2 } }));
    expect(live.status).toBe(403);
    expect(live.body.error.code).toBe("live_key_rotation");
    expect((await read(await rotate(json(`/api/merchant-portal/api-keys/${SEED_IDS.apiKey4}/rotate`, "POST", {}, await cookieFor(SEED_IDS.merchant2)), { params: { keyId: SEED_IDS.apiKey4 } }))).status).toBe(409); // revoked
    expect((await read(await rotate(json(`/api/merchant-portal/api-keys/${SEED_IDS.apiKey1}/rotate`, "POST", {}, await cookieFor(SEED_IDS.merchant2)), { params: { keyId: SEED_IDS.apiKey1 } }))).status).toBe(404);
  });

  it("serves the merchant's own confirmed invoice PDF", async () => {
    const batch = await prisma.settlementBatch.findFirstOrThrow({ where: { merchantId: SEED_IDS.merchant1, status: { not: "collecting" } }, select: { id: true } });
    const c1 = await cookieFor(SEED_IDS.merchant1);
    const res = await invoice(new Request(`${BASE}/api/merchant-portal/settlements/${batch.id}/invoice`, { headers: c1 }), { params: { id: batch.id } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(String.fromCharCode(...new Uint8Array(await res.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    expect((await invoice(new Request(`${BASE}/api/merchant-portal/settlements/${batch.id}/invoice`, { headers: await cookieFor(SEED_IDS.merchant2) }), { params: { id: batch.id } })).status).toBe(404);
    expect((await invoice(new Request(`${BASE}/api/merchant-portal/settlements/${batch.id}/invoice`), { params: { id: batch.id } })).status).toBe(401);
  });
});
