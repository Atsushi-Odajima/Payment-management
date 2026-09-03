// Outbound merchant webhooks (Phase E): request building per notification
// settings, HMAC signature, delivery attempts with retry backoff, the cron,
// manual resend (master) and the demo receiver.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_API_KEYS, SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { POST as resend } from "@/app/api/webhook-logs/[id]/resend/route";
import { GET as listLogs } from "@/app/api/webhook-logs/route";
import { GET as receiver } from "@/app/api/demo/webhook-receiver/route";
import { GET as cron } from "@/app/api/cron/webhook-retry/route";
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, attemptDelivery, enqueueWebhook, nextRetryAt, processDueRetries, signPayload } from "@/lib/webhooks/deliver";
import { buildNotificationRequest, SAMPLE_VALUES } from "@/lib/merchants/notification";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let MASTER: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

type FetchMock = ReturnType<typeof vi.fn>;
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): FetchMock {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init ?? {}));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("notification request", () => {
  it("follows the format / parameter set / identifier settings and exposes the signed payload", () => {
    const post = buildNotificationRequest({ notifyUrl: "https://m.example/n", notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "payment_id" }, SAMPLE_VALUES);
    expect(post.method).toBe("POST");
    expect(JSON.parse(post.body!)).toMatchObject({ payment_id: SAMPLE_VALUES.payment_id, event: "payment.completed", amount: 4980 });
    expect(JSON.parse(post.body!)).not.toHaveProperty("payment_method");
    expect(post.signedPayload).toBe(post.body);
    const get = buildNotificationRequest({ notifyUrl: "https://m.example/n", notifyFormat: "query_get", notifyParamSet: "full", notifyIdFormat: "both" }, SAMPLE_VALUES);
    expect(get.method).toBe("GET");
    expect(get.url).toContain("transaction_id=");
    expect(get.url).toContain("domain=");
    expect(get.signedPayload).toBe(new URL(get.url).search.slice(1));
    expect(nextRetryAt(1, NOW)!.getTime() - NOW.getTime()).toBe(RETRY_DELAYS_MS[0]);
    expect(nextRetryAt(MAX_ATTEMPTS, NOW)).toBeNull();
  });
});

describe("delivery", () => {
  it("enqueues a signed request using the merchant's signing secret and delivers it", async () => {
    const id = await enqueueWebhook(prisma, {
      merchantId: SEED_IDS.merchant1,
      paymentId: SEED_IDS.payment1,
      event: "payment.completed",
      livemode: false,
      values: { ...SAMPLE_VALUES },
    });
    expect(id).toBeTruthy();
    const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! } });
    expect(row.url).toBe("http://localhost:3000/api/demo/webhook-receiver?result=ok");
    const headers = JSON.parse(row.requestHeaders) as Record<string, string>;
    expect(headers["X-Timestamp"]).toMatch(/^\d+$/);
    // merchant1 has a test-mode signing secret (seeded); the signature must verify with it.
    const expected = signPayload(SEED_API_KEYS[SEED_IDS.apiKey3], headers["X-Timestamp"], row.requestBody!);
    expect(headers["X-Signature"]).toBe(`v1=${expected}`);
    expect(headers["Wirepay-Signature"]).toBe(`t=${headers["X-Timestamp"]},v1=${expected}`);

    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe(row.url);
      expect((init.headers as Record<string, string>)["X-Signature"]).toBe(`v1=${expected}`);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const result = await attemptDelivery(prisma, id!, "system", NOW);
    expect(result).toMatchObject({ ok: true, status: "success", responseStatus: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const after = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! }, include: { attemptLog: true } });
    expect(after).toMatchObject({ status: "success", attempts: 1, responseStatus: 200, nextRetryAt: null });
    expect(after.attemptLog).toHaveLength(1);
  });

  it("schedules retries with backoff, abandons after five failures, and the cron sends due ones", async () => {
    const id = (await enqueueWebhook(prisma, { merchantId: SEED_IDS.merchant2, paymentId: SEED_IDS.payment6, event: "payment.failed", livemode: false, values: { ...SAMPLE_VALUES } }))!;
    mockFetch(() => new Response("boom", { status: 500 }));
    let t = NOW;
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      const r = await attemptDelivery(prisma, id, "cron", t);
      const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } });
      if (n < MAX_ATTEMPTS) {
        expect(r.status).toBe("retrying");
        expect(row.nextRetryAt!.getTime() - t.getTime()).toBe(RETRY_DELAYS_MS[n - 1]);
        t = row.nextRetryAt!;
      } else {
        expect(r.status).toBe("abandoned");
        expect(row.nextRetryAt).toBeNull();
      }
    }
    expect(await prisma.webhookAttempt.count({ where: { deliveryId: id } })).toBe(MAX_ATTEMPTS);

    // A timeout is recorded as an error and retried too.
    const id2 = (await enqueueWebhook(prisma, { merchantId: SEED_IDS.merchant1, paymentId: SEED_IDS.payment2, event: "payment.completed", livemode: false, values: { ...SAMPLE_VALUES } }))!;
    // fetch aborted by the 10 s timer is reported as "timeout".
    mockFetch(() => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    const timedOut = await attemptDelivery(prisma, id2, "system", NOW);
    expect(timedOut).toMatchObject({ ok: false, status: "retrying", error: "timeout" });

    // Cron picks up deliveries whose retry time has passed.
    mockFetch(() => new Response("ok", { status: 200 }));
    const later = new Date(NOW.getTime() + 2 * 60_000);
    const summary = await processDueRetries(prisma, later);
    expect(summary).toEqual({ processed: 1, succeeded: 1 }); // id2 (id is abandoned)
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id2 } })).status).toBe("success");

    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await read(await cron(new Request(BASE + "/api/cron/webhook-retry"), {}))).status).toBe(401);
    expect((await read(await cron(new Request(BASE + "/api/cron/webhook-retry", { headers: { authorization: "Bearer s3cret" } }), {}))).status).toBe(200);
  });

  it("is emitted by payment actions and can be resent by a master", async () => {
    const res = await paymentAction(json(`/api/payments/${SEED_IDS.payment3}/capture`, "POST", undefined, MASTER), { params: { id: SEED_IDS.payment3, action: "capture" } });
    expect(res.status).toBe(200);
    // Under tests deliveries stay queued (no network); the row exists with the event.
    const queued = await prisma.webhookDelivery.findFirst({ where: { paymentId: SEED_IDS.payment3, event: "payment.completed", attempts: 0 } });
    expect(queued).not.toBeNull();
    expect(queued!.status).toBe("pending");
    // merchant2 notifies with form_post; decode either transport.
    const body = queued!.requestBody!;
    const decoded = body.startsWith("{") ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
    expect(decoded).toMatchObject({ event: "payment.completed", status: "captured" });
    expect(String(decoded.amount)).toBe("9800");

    mockFetch(() => new Response("ok", { status: 200 }));
    const general = await sessionHeaders("general");
    expect((await read(await resend(json(`/api/webhook-logs/${queued!.id}/resend`, "POST", undefined, general), { params: { id: queued!.id } }))).status).toBe(403);
    const ok = await read(await resend(json(`/api/webhook-logs/${queued!.id}/resend`, "POST", undefined, MASTER), { params: { id: queued!.id } }));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ ok: true, status: "success" });
    expect(await prisma.auditLog.count({ where: { action: "webhook.resend", targetId: queued!.id } })).toBe(1);
    expect((await prisma.webhookAttempt.findFirstOrThrow({ where: { deliveryId: queued!.id } })).trigger).toBe("dashboard");
  });

  it("lists problem deliveries first and exposes the demo receiver", async () => {
    const list = await read(await listLogs(new Request(BASE + "/api/webhook-logs?mode=test"), {}));
    expect(list.body.data.deliveries.map((d: any) => d.status)).toEqual(["abandoned", "retrying", "success"]);
    expect(list.body.data.failedCount).toBe(2);
    const csv = await listLogs(new Request(BASE + "/api/webhook-logs?mode=test&format=csv"), {});
    expect((await csv.text()).split("\r\n").filter(Boolean)).toHaveLength(4);

    const okRes = await read(await receiver(new Request(BASE + "/api/demo/webhook-receiver?result=ok&payment_id=x", { headers: { "x-signature": "v1=abc" } }), {}));
    expect(okRes.status).toBe(200);
    expect(okRes.body.data).toMatchObject({ received: true, signature: "v1=abc", query: { payment_id: "x" } });
    expect((await receiver(new Request(BASE + "/api/demo/webhook-receiver?result=error"), {})).status).toBe(500);
  });
});
