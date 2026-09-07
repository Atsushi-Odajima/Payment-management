// Transactions (決済申請 / 決済): creation with merchant / transfer id, deposit
// reconciliation, expiry, the bank deposit notification endpoint and the
// application-list ordering.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, SEED_TRANSFER_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { POST as depositNotify } from "@/app/api/demo/deposit-notify/route";
import { loadTransactions, parseTransactionFilters } from "@/lib/payments/list";
import { APPLICATION_STATUSES, SALES_STATUSES } from "@/lib/payments/transitions";
import { TRANSFER_DUE_DAYS } from "@/lib/payments/transfer";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let MASTER: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = MASTER) {
  return new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const act = (id: string, action: string, body?: unknown, headers: Record<string, string> | null = null) =>
  paymentAction(json(`/api/payments/${id}/${action}`, "POST", body, headers ?? MASTER), { params: { id, action } });

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("transaction creation", () => {
  it("creates a bank transfer as awaiting_transfer with a transfer id of the merchant's length", async () => {
    const res = await read(
      await createPayment(
        json("/api/payments", "POST", {
          providerId: SEED_IDS.bankProvider,
          merchantId: SEED_IDS.merchant2, // 8-digit ids
          orderNumber: "ORD-BANK-1",
          amount: 5000,
          productName: "Gift set",
          customerName: "Test User",
          customerId: "u_test",
        }),
        {},
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("awaiting_transfer");
    expect(res.body.data.transferId).toMatch(/^[1-9]\d{7}$/);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.method).toBe("bank");
    expect(row.merchantId).toBe(SEED_IDS.merchant2);
    expect(row.productName).toBe("Gift set");
    expect(row.customerId).toBe("u_test");
    expect(row.transferDueAt!.getTime() - row.createdAt.getTime()).toBe(TRANSFER_DUE_DAYS * 86_400_000);

    const seven = await read(
      await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.bankProvider, merchantId: SEED_IDS.merchant1, orderNumber: "ORD-BANK-2", amount: 100 }), {}),
    );
    expect(seven.body.data.transferId).toMatch(/^[1-9]\d{6}$/);
  });

  it("rejects an unknown merchant and stores the method for card payments", async () => {
    const bad = await read(
      await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: "mer_nope", orderNumber: "X", amount: 100 }), {}),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fieldErrors).toEqual({ merchantId: "invalid" });

    const ok = await read(
      await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: "Y", amount: 100, autoCapture: false }), {}),
    );
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: ok.body.data.id } });
    expect(row.method).toBe("credit");
    expect(row.status).toBe("authorized");
    expect(row.transferId).toBeNull();
  });
});

describe("deposit reconciliation (入金消込)", () => {
  it("keeps a short deposit awaiting with the short flag, then completes on the balance", async () => {
    const first = await read(await act(SEED_IDS.payment4, "deposit", { amount: 10000 }));
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ status: "awaiting_transfer", depositAmount: 10000, depositDiff: "short" });

    const second = await read(await act(SEED_IDS.payment4, "deposit", { amount: 14800 }));
    expect(second.body.data).toMatchObject({ status: "captured", depositAmount: 24800, depositDiff: null });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment4 } });
    expect(row.capturedAt).not.toBeNull();
    const events = await prisma.paymentEvent.findMany({ where: { paymentId: SEED_IDS.payment4, type: "deposit" }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => [e.amount, e.toStatus])).toEqual([
      [10000, "awaiting_transfer"],
      [14800, "captured"],
    ]);
  });

  it("completes an excess deposit with the excess flag", async () => {
    const res = await read(await act(SEED_IDS.payment5, "deposit", { amount: 7000 }));
    expect(res.body.data).toMatchObject({ status: "captured", depositAmount: 7000, depositDiff: "excess" });
  });

  it("validates the amount, the role and the status", async () => {
    expect((await act(SEED_IDS.payment4, "deposit", { amount: 0 })).status).toBe(400);
    expect((await act(SEED_IDS.payment4, "deposit", { amount: 100 }, {})).status).toBe(401);
    const notAwaiting = await read(await act(SEED_IDS.payment3, "deposit", { amount: 100 }));
    expect(notAwaiting.status).toBe(409);
    expect(notAwaiting.body.error.code).toBe("invalid_transition");
  });
});

describe("expiry and manual outcomes", () => {
  it("expires only overdue transfers", async () => {
    // The seed dates are relative to a fixed NOW, but the expire action checks the real clock:
    // push the deadline into the real future so the "not overdue" branch does not depend on today's date.
    await prisma.payment.update({ where: { id: SEED_IDS.payment4 }, data: { transferDueAt: new Date(Date.now() + 7 * 86_400_000) } });
    const tooEarly = await read(await act(SEED_IDS.payment4, "expire"));
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe("not_overdue");

    const overdue = await read(await act(SEED_IDS.payment5, "expire"));
    expect(overdue.body.data.status).toBe("expired");
    const again = await act(SEED_IDS.payment5, "deposit", { amount: 6600 });
    expect(again.status).toBe(409);
  });

  it("marks an authorized card transaction as failed", async () => {
    const res = await read(await act(SEED_IDS.payment3, "fail"));
    expect(res.body.data.status).toBe("failed");
    const ev = await prisma.paymentEvent.findFirstOrThrow({ where: { paymentId: SEED_IDS.payment3, type: "fail" } });
    expect(ev).toMatchObject({ fromStatus: "authorized", toStatus: "failed", actor: "dashboard" });
  });
});

describe("POST /api/demo/deposit-notify", () => {
  const notify = (body: unknown, headers: Record<string, string> = {}) =>
    depositNotify(json("/api/demo/deposit-notify", "POST", body, headers), {});

  it("reconciles by transfer id with actor 'bank' when no secret is configured", async () => {
    vi.stubEnv("DEPOSIT_NOTIFY_SECRET", "");
    const res = await read(await notify({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4], amount: 24800 }));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ paymentId: SEED_IDS.payment4, status: "captured", completed: true, depositDiff: null });
    const ev = await prisma.paymentEvent.findFirstOrThrow({ where: { paymentId: SEED_IDS.payment4, type: "deposit" } });
    expect(ev.actor).toBe("bank");
  });

  it("requires the bearer secret when configured", async () => {
    vi.stubEnv("DEPOSIT_NOTIFY_SECRET", "s3cret");
    const denied = await notify({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment5], amount: 6600 }, { authorization: "Bearer nope" });
    expect(denied.status).toBe(401);
    const ok = await read(await notify({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment5], amount: 6000 }, { authorization: "Bearer s3cret" }));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ completed: false, depositDiff: "short", depositAmount: 6000 });
  });

  it("records an unknown transfer id as an unmatched deposit (202) and answers 409 for a completed one", async () => {
    vi.stubEnv("DEPOSIT_NOTIFY_SECRET", "");
    const unknown = await read(await notify({ transferId: "9999999", amount: 1, payerName: "FORGOT ID" }));
    expect(unknown.status).toBe(202);
    expect(unknown.body.data.matched).toBe(false);
    expect(await prisma.unmatchedDeposit.count({ where: { id: unknown.body.data.unmatchedDepositId, status: "unmatched", source: "bank" } })).toBe(1);
    const done = await notify({ transferId: SEED_TRANSFER_IDS[SEED_IDS.payment7], amount: 1 });
    expect(done.status).toBe(409);
    // A malformed transfer id is not an error for the bank: it is filed as an unmatched deposit too.
    expect((await notify({ transferId: "abc", amount: 1 })).status).toBe(202);
    expect((await notify({ transferId: "abc", amount: 0 })).status).toBe(400);
  });
});

describe("transaction lists", () => {
  it("puts awaiting transfers first by deadline (overdue on top) and keeps sales separate", async () => {
    const apps = await loadTransactions({
      allowedStatuses: APPLICATION_STATUSES,
      filters: parseTransactionFilters({}, APPLICATION_STATUSES),
      page: 1,
      pageSize: 20,
      order: "applications",
      now: NOW,
    });
    // The konbini slip (payment14, due in 2 days) shares the deadline lane with the awaiting transfers.
    expect(apps.items.map((i) => i.id)).toEqual([SEED_IDS.payment5, SEED_IDS.payment14, SEED_IDS.payment4, SEED_IDS.payment3, SEED_IDS.payment6]);
    expect(apps.items[0].overdue).toBe(true);
    expect(apps.items[1].overdue).toBe(false);

    const sales = await loadTransactions({
      allowedStatuses: SALES_STATUSES,
      filters: parseTransactionFilters({}, SALES_STATUSES),
      page: 1,
      pageSize: 20,
      order: "sales",
      now: NOW,
    });
    expect(sales.items.map((i) => i.id).sort()).toEqual([SEED_IDS.payment1, SEED_IDS.payment2, SEED_IDS.payment7, SEED_IDS.payment12, SEED_IDS.payment13, SEED_IDS.payment15].sort());
  });

  it("filters by method, merchant and period", async () => {
    const bank = await loadTransactions({
      allowedStatuses: APPLICATION_STATUSES,
      filters: parseTransactionFilters({ method: "bank" }, APPLICATION_STATUSES),
      page: 1,
      pageSize: 20,
      order: "applications",
      now: NOW,
    });
    expect(bank.items.every((i) => i.method === "bank")).toBe(true);
    expect(bank.total).toBe(2);

    const merchant2 = await loadTransactions({
      allowedStatuses: APPLICATION_STATUSES,
      filters: parseTransactionFilters({ merchant: SEED_IDS.merchant2 }, APPLICATION_STATUSES),
      page: 1,
      pageSize: 20,
      order: "applications",
      now: NOW,
    });
    expect(merchant2.items.map((i) => i.id).sort()).toEqual([SEED_IDS.payment3, SEED_IDS.payment4, SEED_IDS.payment6].sort());

    // payment5 was applied 9 days before NOW (2026-08-23 JST); a window starting 2026-08-25 excludes it.
    const recent = await loadTransactions({
      allowedStatuses: APPLICATION_STATUSES,
      filters: parseTransactionFilters({ from: "2026-08-25", status: "awaiting_transfer" }, APPLICATION_STATUSES),
      page: 1,
      pageSize: 20,
      order: "applications",
      now: NOW,
    });
    expect(recent.items.map((i) => i.id)).toEqual([SEED_IDS.payment4]);
    expect(parseTransactionFilters({ from: "2026-13-40", status: "captured" }, APPLICATION_STATUSES)).toMatchObject({ from: "", status: "" });
  });
});
