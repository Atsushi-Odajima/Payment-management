// Route-handler level integration tests against a real SQLite database.
// Handlers are plain functions (req, ctx) so we call them directly — the Edge
// middleware (auth / CSRF) is unit-tested separately and not involved here.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { readCredentialsForUse } from "@/lib/providers/credentials";
import { signWebhookPayload } from "@/lib/webhooks/verify";
import { WEBHOOK_SIGNATURE_HEADER } from "@/lib/webhooks/events";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { GET as listProviders, POST as createProvider } from "@/app/api/providers/route";
import { DELETE as deleteProvider, PATCH as patchProvider } from "@/app/api/providers/[id]/route";
import { POST as webhook } from "@/app/api/webhooks/[providerId]/route";

// Handlers without route params still take a context argument.
const createPayment2 = (req: Request) => createPayment(req, {});
const createProvider2 = (req: Request) => createProvider(req, {});

const BASE = "http://localhost";

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

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: new Date("2026-09-01T03:00:00Z") });
});

describe("payments", () => {
  it("refuses to capture an already captured payment (409, localized)", async () => {
    const res = await paymentAction(json(`/api/payments/${SEED_IDS.payment1}/capture`, "POST", undefined, { "x-lang": "en" }), {
      params: { id: SEED_IDS.payment1, action: "capture" },
    });
    const { status, body } = await read(res);
    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe("This payment cannot be captured in its current state");
  });

  it("captures an authorized payment atomically and records an event", async () => {
    const res = await paymentAction(json(`/api/payments/${SEED_IDS.payment3}/capture`, "POST"), {
      params: { id: SEED_IDS.payment3, action: "capture" },
    });
    expect((await read(res)).body.data.status).toBe("captured");
    const events = await prisma.paymentEvent.findMany({ where: { paymentId: SEED_IDS.payment3 }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["created", "capture"]);
    expect(events[1]).toMatchObject({ fromStatus: "authorized", toStatus: "captured", actor: "dashboard" });
  });

  it("supports partial refunds, then a final refund", async () => {
    const first = await paymentAction(json(`/api/payments/${SEED_IDS.payment1}/refund`, "POST", { amount: 1000, reason: "size" }), {
      params: { id: SEED_IDS.payment1, action: "refund" },
    });
    expect((await read(first)).body.data).toMatchObject({ status: "partially_refunded", amountRefunded: 1000 });

    const tooMuch = await paymentAction(json(`/api/payments/${SEED_IDS.payment1}/refund`, "POST", { amount: 4000 }), {
      params: { id: SEED_IDS.payment1, action: "refund" },
    });
    expect((await read(tooMuch)).status).toBe(400);

    const rest = await paymentAction(json(`/api/payments/${SEED_IDS.payment1}/refund`, "POST", {}), {
      params: { id: SEED_IDS.payment1, action: "refund" },
    });
    expect((await read(rest)).body.data).toMatchObject({ status: "refunded", amountRefunded: 4980 });
    expect(await prisma.refund.count({ where: { paymentId: SEED_IDS.payment1 } })).toBe(2);
  });

  it("rejects unknown actions with 404", async () => {
    const res = await paymentAction(json(`/api/payments/${SEED_IDS.payment1}/fail`, "POST"), {
      params: { id: SEED_IDS.payment1, action: "fail" },
    });
    expect(res.status).toBe(404);
  });

  it("replays the same response for a repeated Idempotency-Key", async () => {
    const payload = { providerId: SEED_IDS.stripeProvider, orderNumber: "ORD-IDEM", amount: 500 };
    const a = await read(await createPayment2(json("/api/payments", "POST", payload, { "idempotency-key": "key-12345678" })));
    const b = await read(await createPayment2(json("/api/payments", "POST", payload, { "idempotency-key": "key-12345678" })));
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(b.body.data.replayed).toBe(true);
    expect(await prisma.payment.count({ where: { orderNumber: "ORD-IDEM" } })).toBe(1);
  });

  it("snapshots livemode and refuses disabled providers", async () => {
    await prisma.paymentProvider.update({ where: { id: SEED_IDS.paypayProvider }, data: { status: "disabled" } });
    const res = await read(
      await createPayment2(json("/api/payments", "POST", { providerId: SEED_IDS.paypayProvider, orderNumber: "X", amount: 100 })),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("provider_disabled");

    const ok = await read(
      await createPayment2(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, orderNumber: "Y", amount: 100 })),
    );
    const created = await prisma.payment.findUniqueOrThrow({ where: { id: ok.body.data.id } });
    expect(created.livemode).toBe(false); // seeded provider is in test mode
    expect(created.status).toBe("captured");
  });

  it("rejects non-JPY currency", async () => {
    const res = await read(
      await createPayment2(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, orderNumber: "Z", amount: 100, currency: "USD" })),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });
});

describe("providers", () => {
  it("never returns credentials from the list endpoint", async () => {
    const { body } = await read(await listProviders(new Request(BASE + "/api/providers"), {}));
    expect(JSON.stringify(body)).not.toContain("credentials");
    expect(body.data.providers).toHaveLength(2);
  });

  it("keeps the existing ciphertext when a secret is saved blank", async () => {
    const before = await prisma.paymentProvider.findUniqueOrThrow({ where: { id: SEED_IDS.stripeProvider } });
    const res = await patchProvider(
      json(`/api/providers/${SEED_IDS.stripeProvider}`, "PATCH", { credentials: { secret_key: "", statement_descriptor: "NEW" } }),
      { params: { id: SEED_IDS.stripeProvider } },
    );
    expect(res.status).toBe(200);
    const after = await prisma.paymentProvider.findUniqueOrThrow({ where: { id: SEED_IDS.stripeProvider } });
    expect(JSON.parse(after.credentials).secret_key).toBe(JSON.parse(before.credentials).secret_key);
    expect(readCredentialsForUse("stripe", after.credentials).statement_descriptor).toBe("NEW");
  });

  it("validates credential formats from the registry (url field)", async () => {
    const res = await read(
      await createProvider2(
        json("/api/providers", "POST", {
          providerKey: "gmo_pg",
          displayName: "GMO",
          credentials: { site_id: "a", site_password: "b", shop_id: "c", shop_password: "d", api_endpoint: "nope" },
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it("refuses to delete a provider that has payments (409) and deletes an empty one", async () => {
    const blocked = await read(
      await deleteProvider(new Request(BASE + `/api/providers/${SEED_IDS.stripeProvider}`, { method: "DELETE" }), {
        params: { id: SEED_IDS.stripeProvider },
      }),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("provider_has_payments");

    const fresh = await read(
      await createProvider2(json("/api/providers", "POST", { providerKey: "custom_webhook", displayName: "X", credentials: { service_name: "s", endpoint: "https://e.example" } })),
    );
    const del = await deleteProvider(new Request(BASE + `/api/providers/${fresh.body.data.id}`, { method: "DELETE" }), {
      params: { id: fresh.body.data.id },
    });
    expect(del.status).toBe(200);
  });
});

describe("webhooks", () => {
  async function deliver(eventId: string, type: string, externalId: string, amount?: number, secretOverride?: string) {
    const provider = await prisma.paymentProvider.findUniqueOrThrow({ where: { id: SEED_IDS.stripeProvider } });
    const secret = secretOverride ?? readCredentialsForUse("stripe", provider.credentials).webhook_secret;
    const raw = JSON.stringify({ id: eventId, type, data: { externalId, amount } });
    const ts = Math.floor(Date.now() / 1000);
    const req = new Request(BASE + `/api/webhooks/${provider.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(secret, ts, raw) },
      body: raw,
    });
    return read(await webhook(req, { params: { providerId: provider.id } }));
  }

  it("applies a signed payment.captured event and ignores the duplicate", async () => {
    const first = await deliver("evt_1", "payment.captured", "stripe_demo_003");
    expect(first.status).toBe(200);
    expect(first.body.data.payment.status).toBe("captured");
    const dup = await deliver("evt_1", "payment.captured", "stripe_demo_003");
    expect(dup.body.data.duplicate).toBe(true);
    const events = await prisma.paymentEvent.findMany({ where: { paymentId: SEED_IDS.payment3, type: "capture" } });
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("webhook");
  });

  it("rejects a bad signature", async () => {
    const res = await deliver("evt_2", "payment.captured", "stripe_demo_003", undefined, "wrong-secret");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("signature_mismatch");
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it("records failures for unknown payments", async () => {
    const res = await deliver("evt_3", "payment.captured", "does_not_exist");
    expect(res.status).toBe(404);
    const stored = await prisma.webhookEvent.findFirstOrThrow({ where: { externalEventId: "evt_3" } });
    expect(stored.error).toBe("payment_not_found");
  });
});
