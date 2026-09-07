// Phase P3 (operations screens, second half):
//   3-5 settlement detail: shared invoice grouping, tax rows, order numbers on lines
//   3-6 webhook detail: current transaction state and the last successful delivery
//   3-7 method controls: who suspended and when
//   3-8 receipts issued from the merchant portal (source merchant, description)

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { POST as portalReceipt, GET as portalReceiptPdf } from "@/app/api/merchant-portal/receipts/[paymentId]/route";
import { POST as issueReceiptRoute } from "@/app/api/payments/[id]/receipt/route";
import { PUT as putControl } from "@/app/api/payment-method-controls/route";
import { MERCHANT_COOKIE, createMerchantToken } from "@/lib/merchant-portal/token";
import { loadGlobalControls } from "@/lib/payments/method-controls";
import { loadSettlement } from "@/lib/settlements/list";
import { invoiceItems, summarizeTax } from "@/lib/settlements/tax";
import { loadWebhookDelivery } from "@/lib/webhooks/list";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let ADMIN: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
async function cookieFor(merchantId: string): Promise<Record<string, string>> {
  return { cookie: `${MERCHANT_COOKIE}=${await createMerchantToken(merchantId)}` };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
});

describe("P3-5 settlement detail data", () => {
  it("groups fee lines like the invoice and resolves order numbers", () => {
    const lines = [
      { kind: "payment", method: "credit", amount: 10_000, fee: 360, taxCategory: "standard10" },
      { kind: "payment", method: "credit", amount: 5_000, fee: 180, taxCategory: "standard10" },
      { kind: "payment", method: "bank", amount: 8_000, fee: 100, taxCategory: "standard10" },
      { kind: "refund", method: "credit", amount: -1_000, fee: 0, taxCategory: "exempt" },
    ];
    const items = invoiceItems(lines, 330);
    expect(items).toEqual([
      { key: "credit", count: 2, base: 15_000, fee: 540, taxCategory: "standard10" },
      { key: "bank", count: 1, base: 8_000, fee: 100, taxCategory: "standard10" },
      { key: "settlement_fee", count: 1, base: 0, fee: 330, taxCategory: "standard10" },
    ]);
    const rows = summarizeTax(items.map((i) => ({ taxCategory: i.taxCategory, amount: i.fee })), "floor");
    expect(rows).toEqual([{ category: "standard10", ratePercent: 10, inclusive: 970, tax: 88, exclusive: 882 }]);
  });

  it("loadSettlement returns the order number of each line's transaction", async () => {
    const data = await loadSettlement(SEED_IDS.settlement1);
    expect(data).not.toBeNull();
    // Seeded lines carry descriptions but no payment ids; a line pointing at a real payment gets its order number.
    await prisma.settlementLine.updateMany({ where: { batchId: SEED_IDS.settlement1, kind: "payment" }, data: { paymentId: SEED_IDS.payment1 } });
    const again = await loadSettlement(SEED_IDS.settlement1);
    expect(again!.lines.filter((l) => l.kind === "payment").every((l) => l.orderNumber === "ORD-DEMO-001")).toBe(true);
    expect(again!.lines.find((l) => l.kind === "refund")!.orderNumber).toBeNull();
  });
});

describe("P3-6 webhook detail context", () => {
  it("carries the transaction's current status and the last successful delivery of the same event", async () => {
    // webhook1 = payment.completed for payment1 (success); a second, failed delivery of the same event sees it as lastSuccess.
    const failed = await prisma.webhookDelivery.create({
      data: { merchantId: SEED_IDS.merchant1, paymentId: SEED_IDS.payment1, livemode: false, event: "payment.completed", url: "https://kotori.example.jp/hook", method: "POST", requestHeaders: "{}", requestBody: "{}", status: "failed", attempts: 1 },
    });
    const detail = await loadWebhookDelivery(failed.id);
    expect(detail!.payment).toMatchObject({ id: SEED_IDS.payment1, orderNumber: "ORD-DEMO-001", status: "captured" });
    expect(detail!.lastSuccess?.id).toBe(SEED_IDS.webhook1);
    // The successful one itself has no other success.
    expect((await loadWebhookDelivery(SEED_IDS.webhook1))!.lastSuccess).toBeNull();
  });
});

describe("P3-7 suspension details", () => {
  it("resolves the operator who suspended a method", async () => {
    const res = await read(await putControl(json("/api/payment-method-controls", "PUT", { scope: "global", method: "qr", suspended: true, reason: "acquirer outage", resumeAt: "" }, ADMIN), {}));
    expect(res.status).toBe(200);
    const rows = await loadGlobalControls(prisma);
    const qr = rows.find((r) => r.method === "qr")!;
    expect(qr.suspended).toBe(true);
    expect(qr.suspendedByName).toBe("kuromaru");
    expect(qr.suspendedAt).not.toBeNull();
    expect(rows.find((r) => r.method === "credit")!.suspendedByName).toBeNull();
  });
});

describe("P3-8 receipts from the merchant portal", () => {
  it("lets the merchant issue a receipt of its own completed transaction with a description, shared with the dashboard", async () => {
    const m1 = await cookieFor(SEED_IDS.merchant1);
    // Only own transactions; only completed ones.
    expect((await portalReceipt(json(`/api/merchant-portal/receipts/${SEED_IDS.payment3}`, "POST", { recipientName: "X" }, m1), { params: { paymentId: SEED_IDS.payment3 } })).status).toBe(404); // merchant2's
    expect((await read(await portalReceipt(json(`/api/merchant-portal/receipts/${SEED_IDS.payment2}`, "POST", {}, m1), { params: { paymentId: SEED_IDS.payment2 } }))).status).toBe(200);
    expect((await portalReceipt(json(`/api/merchant-portal/receipts/${SEED_IDS.payment1}`, "POST", {}), { params: { paymentId: SEED_IDS.payment1 } })).status).toBe(401);

    const res = await read(await portalReceipt(json(`/api/merchant-portal/receipts/${SEED_IDS.payment1}`, "POST", { recipientName: "株式会社テスト", description: "お品代" }, m1), { params: { paymentId: SEED_IDS.payment1 } }));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: "merchant", recipientName: "株式会社テスト", description: "お品代", reissueCount: 0 });
    expect(res.body.data.receiptNo).toMatch(/^RC-\d{6}-\d{5}$/);
    const audit = await prisma.auditLog.findFirst({ where: { action: "receipt.issue", targetId: res.body.data.id } });
    expect(audit).toMatchObject({ actorType: "merchant", merchantId: SEED_IDS.merchant1 });

    // PDF for the merchant; the same row is visible to the operator, whose re-issue keeps the description.
    const pdf = await portalReceiptPdf(new Request(`${BASE}/api/merchant-portal/receipts/${SEED_IDS.payment1}`, { headers: m1 }), { params: { paymentId: SEED_IDS.payment1 } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const reissued = await read(await issueReceiptRoute(json(`/api/payments/${SEED_IDS.payment1}/receipt`, "POST", { recipientName: "" }, ADMIN), { params: { id: SEED_IDS.payment1 } }));
    expect(reissued.body.data).toMatchObject({ receiptNo: res.body.data.receiptNo, reissueCount: 1, description: "お品代", source: "merchant" });
    // A merchant cannot read another merchant's PDF.
    const m2 = await cookieFor(SEED_IDS.merchant2);
    expect((await portalReceiptPdf(new Request(`${BASE}/api/merchant-portal/receipts/${SEED_IDS.payment1}`, { headers: m2 }), { params: { paymentId: SEED_IDS.payment1 } })).status).toBe(404);
  });
});
