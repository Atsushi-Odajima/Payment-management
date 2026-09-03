// Phase K: konbini payments (receipt numbers, deadlines, the store's payment
// notification through the shared deposit action, expiry), receipts (numbering,
// re-issue, PDF, signed customer download) and qualified invoices (issuer
// settings, tax breakdown, confirmed-only export, permissions).

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_CVS_RECEIPT_NOS, SEED_IDS, SEED_PAYMENT_LINK_TOKEN, seed, truncateAll } from "@/prisma/seed-data";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as paymentAction } from "@/app/api/payments/[id]/[action]/route";
import { GET as receiptPdf, POST as issueReceiptRoute } from "@/app/api/payments/[id]/receipt/route";
import { POST as cvsNotify } from "@/app/api/demo/cvs-notify/route";
import { POST as checkout } from "@/app/api/pay/[token]/route";
import { POST as completeCheckout } from "@/app/api/pay/[token]/complete/route";
import { GET as customerReceipt } from "@/app/api/pay/[token]/receipt/route";
import { PATCH as patchTerms } from "@/app/api/merchants/[id]/terms/route";
import { PATCH as patchSettlement } from "@/app/api/merchants/[id]/settlement/route";
import { PUT as putGlobal } from "@/app/api/global-settings/route";
import { POST as generateSettlement } from "@/app/api/settlements/generate/route";
import { POST as settlementAction } from "@/app/api/settlements/[id]/[action]/route";
import { GET as invoicePdf } from "@/app/api/settlements/[id]/invoice/route";
import { expireOverdueTransfers } from "@/lib/payments/expire";
import { loadTransactions, parseTransactionFilters } from "@/lib/payments/list";
import { APPLICATION_STATUSES } from "@/lib/payments/transitions";
import { formatCvsReceiptNo, generateCvsReceiptNo, isCvsReceiptNoFormat } from "@/lib/payments/konbini";
import { includedTax, summarizeTax } from "@/lib/settlements/tax";
import { verifyCustomerReceiptQuery } from "@/lib/receipts/customer-token";
import { runDailyDigests } from "@/lib/notifications/digest";
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
async function pdfHead(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  return String.fromCharCode(...buf.slice(0, 5));
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
  ACCOUNTING = await sessionHeaders("accounting");
  CS = await sessionHeaders("cs");
  VIEWER = await sessionHeaders("viewer");
});

describe("K-1 konbini payments", () => {
  it("issues a 13-digit receipt number and the merchant's deadline, and lists the slip with awaiting transfers", async () => {
    expect(isCvsReceiptNoFormat(generateCvsReceiptNo())).toBe(true);
    expect(formatCvsReceiptNo("4102993827716")).toBe("4102-9938-27716");

    const res = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.cvsProvider, merchantId: SEED_IDS.merchant3, orderNumber: "ORD-CVS-1", amount: 2500, customerName: "Test", customerEmail: "cvs@example.com", cvsBrand: "familymart" }), {}));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.cvsReceiptNo).toMatch(/^[1-9]\d{12}$/);
    expect(res.body.data.cvsBrand).toBe("familymart");
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.transferDueAt!.getTime() - row.createdAt.getTime()).toBe(3 * 86_400_000);
    // The customer got the konbini instructions e-mail.
    const mail = await prisma.emailLog.findFirst({ where: { paymentId: row.id, templateKey: "cvs_guide" } });
    expect(mail).not.toBeNull();
    expect(mail!.body).toContain(formatCvsReceiptNo(row.cvsReceiptNo!));

    // Application list: konbini slips waiting for payment share the deadline lane with awaiting transfers.
    const list = await loadTransactions({ allowedStatuses: APPLICATION_STATUSES, filters: parseTransactionFilters(undefined, APPLICATION_STATUSES), page: 1, pageSize: 50, order: "applications", now: NOW });
    const waiting = list.items.filter((i) => i.status === "awaiting_transfer" || (i.status === "pending" && i.cvsReceiptNo));
    const others = list.items.filter((i) => !(i.status === "awaiting_transfer" || (i.status === "pending" && i.cvsReceiptNo)));
    expect(list.items.slice(0, waiting.length).every((i) => i.transferDueAt !== null)).toBe(true);
    expect(others.length).toBeGreaterThan(0);
    expect(list.items.find((i) => i.id === SEED_IDS.payment14)?.cvsReceiptNo).toBe(SEED_CVS_RECEIPT_NOS[SEED_IDS.payment14]);
  });

  it("completes the slip through the store's payment notification (same deposit action) and webhooks the merchant", async () => {
    const before = await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment14 } });
    const res = await read(await cvsNotify(json("/api/demo/cvs-notify", "POST", { receiptNo: "4102-9938-27716" }, {}), {}));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ completed: true, status: "captured", paymentId: SEED_IDS.payment14 });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment14 }, include: { events: true } });
    expect(row.status).toBe("captured");
    expect(row.cvsPaidAt).not.toBeNull();
    expect(row.depositAmount).toBe(3980);
    expect(row.events.find((e) => e.type === "deposit")?.actor).toBe("cvs");
    expect(await prisma.webhookDelivery.count({ where: { paymentId: SEED_IDS.payment14, event: "payment.completed" } })).toBe(before + 1);
    expect(await prisma.auditLog.count({ where: { action: "payment.deposit", actorType: "cvs", targetId: SEED_IDS.payment14 } })).toBe(1);

    // Unknown / malformed numbers → 404; a second notification → 409 (already completed).
    expect((await read(await cvsNotify(json("/api/demo/cvs-notify", "POST", { receiptNo: "1111111111111" }, {}), {}))).status).toBe(404);
    expect((await read(await cvsNotify(json("/api/demo/cvs-notify", "POST", { receiptNo: "4102993827716" }, {}), {}))).status).toBe(409);
  });

  it("keeps a short store payment pending and lets the dashboard reconcile the rest", async () => {
    const short = await read(await cvsNotify(json("/api/demo/cvs-notify", "POST", { receiptNo: "4102993827716", amount: 1000 }, {}), {}));
    expect(short.body.data).toMatchObject({ completed: false, status: "pending", depositDiff: "short" });
    const rest = await read(await paymentAction(json(`/api/payments/${SEED_IDS.payment14}/deposit`, "POST", { amount: 2980 }, ACCOUNTING), { params: { id: SEED_IDS.payment14, action: "deposit" } }));
    expect(rest.body.data.status).toBe("captured");
    // A deposit on a card transaction (no transfer id, no receipt number) is still refused.
    const credit = await read(await createPayment(json("/api/payments", "POST", { providerId: SEED_IDS.stripeProvider, merchantId: SEED_IDS.merchant1, orderNumber: "ORD-CR-1", amount: 100, autoCapture: false }), {}));
    expect((await read(await paymentAction(json(`/api/payments/${credit.body.data.id}/deposit`, "POST", { amount: 100 }, ACCOUNTING), { params: { id: credit.body.data.id, action: "deposit" } }))).status).toBe(409);
  });

  it("expires overdue slips in the hourly job and counts them in the daily digest", async () => {
    await prisma.payment.update({ where: { id: SEED_IDS.payment14 }, data: { transferDueAt: new Date(Date.now() - 3_600_000) } });
    const digest = await runDailyDigests(prisma, new Date());
    expect(digest.cvsOverdue).toBe(1);
    expect(await prisma.notification.count({ where: { kind: "cvs.overdue" } })).toBe(1);
    const r = await expireOverdueTransfers();
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: SEED_IDS.payment14 } })).status).toBe("expired");
  });

  it("stores the merchant's konbini deadline days (1–30)", async () => {
    expect((await read(await patchTerms(json(`/api/merchants/${SEED_IDS.merchant3}/terms`, "PATCH", { transferDueDays: 7, cvsDueDays: 5, refundWindowDays: 180 }, ACCOUNTING), { params: { id: SEED_IDS.merchant3 } }))).body.data.cvsDueDays).toBe(5);
    expect((await read(await patchTerms(json(`/api/merchants/${SEED_IDS.merchant3}/terms`, "PATCH", { transferDueDays: 7, cvsDueDays: 45, refundWindowDays: 180 }, ACCOUNTING), { params: { id: SEED_IDS.merchant3 } }))).status).toBe(400);
    expect((await read(await patchTerms(json(`/api/merchants/${SEED_IDS.merchant3}/terms`, "PATCH", { transferDueDays: 7, cvsDueDays: 5, refundWindowDays: 180 }, CS), { params: { id: SEED_IDS.merchant3 } }))).status).toBe(403);
  });

  it("offers konbini on the hosted payment page and settles the demo payment through the deposit action", async () => {
    await prisma.paymentLink.update({ where: { id: SEED_IDS.paymentLink1 }, data: { merchantId: SEED_IDS.merchant3 } });
    const co = await read(await checkout(json(`/api/pay/${SEED_PAYMENT_LINK_TOKEN}`, "POST", { method: "convenience", customerName: "Link Buyer", customerEmail: "buyer@example.com", cvsBrand: "ministop" }, {}), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    expect(co.status).toBe(201);
    expect(co.body.data.payment.cvsReceiptNo).toMatch(/^\d{13}$/);
    expect(co.body.data.payment.cvsBrand).toBe("ministop");
    const done = await read(await completeCheckout(json(`/api/pay/${SEED_PAYMENT_LINK_TOKEN}/complete`, "POST", { paymentId: co.body.data.payment.id }, {}), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    expect(done.body.data.status).toBe("captured");
    expect(done.body.data.receiptUrl).toMatch(new RegExp(`^/api/pay/${SEED_PAYMENT_LINK_TOKEN}/receipt\\?p=`));
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: co.body.data.payment.id } });
    expect(row.cvsPaidAt).not.toBeNull();
  });
});

describe("K-2 receipts", () => {
  it("issues numbered receipts, counts re-issues, audits and renders a PDF (permission receipt.issue)", async () => {
    const issue = (id: string, headers: Record<string, string>, body: unknown = {}) => issueReceiptRoute(json(`/api/payments/${id}/receipt`, "POST", body, headers), { params: { id } });
    expect((await read(await issue(SEED_IDS.payment1, VIEWER))).status).toBe(403);
    expect((await read(await issue(SEED_IDS.payment3, CS))).status).toBe(409); // authorized, not completed

    const first = await read(await issue(SEED_IDS.payment1, CS, { recipientName: "山田 太郎" }));
    expect(first.status).toBe(200);
    expect(first.body.data.receiptNo).toMatch(/^RC-\d{6}-\d{5}$/);
    expect(first.body.data.reissueCount).toBe(0);
    expect(first.body.data.amount).toBe(4980);
    // Numbers are sequential within the month.
    const second = await read(await issue(SEED_IDS.payment2, CS));
    expect(Number(second.body.data.receiptNo.slice(-5))).toBe(Number(first.body.data.receiptNo.slice(-5)) + 1);

    const again = await read(await issue(SEED_IDS.payment1, ACCOUNTING, { recipientName: "株式会社テスト" }));
    expect(again.body.data.receiptNo).toBe(first.body.data.receiptNo);
    expect(again.body.data.reissueCount).toBe(1);
    expect(again.body.data.recipientName).toBe("株式会社テスト");
    expect(await prisma.auditLog.count({ where: { action: "receipt.issue", targetId: first.body.data.id } })).toBe(2);

    const pdf = await receiptPdf(new Request(`${BASE}/api/payments/${SEED_IDS.payment1}/receipt`, { headers: ADMIN }), { params: { id: SEED_IDS.payment1 } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(await pdfHead(pdf)).toBe("%PDF-");
    // Not issued yet → 404; anonymous → 401.
    expect((await receiptPdf(new Request(`${BASE}/api/payments/${SEED_IDS.payment13}/receipt`, { headers: ADMIN }), { params: { id: SEED_IDS.payment13 } })).status).toBe(404);
    expect((await receiptPdf(new Request(`${BASE}/api/payments/${SEED_IDS.payment1}/receipt`), { params: { id: SEED_IDS.payment1 } })).status).toBe(401);
  });

  it("lets the customer download the receipt with the signed link only (no admin session)", async () => {
    const co = await read(await checkout(json(`/api/pay/${SEED_PAYMENT_LINK_TOKEN}`, "POST", { method: "credit", customerName: "Link Buyer" }, {}), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    const done = await read(await completeCheckout(json(`/api/pay/${SEED_PAYMENT_LINK_TOKEN}/complete`, "POST", { paymentId: co.body.data.payment.id }, {}), { params: { token: SEED_PAYMENT_LINK_TOKEN } }));
    const url = new URL(BASE + done.body.data.receiptUrl);
    expect(verifyCustomerReceiptQuery(SEED_PAYMENT_LINK_TOKEN, { p: url.searchParams.get("p"), e: url.searchParams.get("e"), s: url.searchParams.get("s") })).toBe(co.body.data.payment.id);
    const res = await customerReceipt(new Request(url), { params: { token: SEED_PAYMENT_LINK_TOKEN } });
    expect(res.status).toBe(200);
    expect(await pdfHead(res)).toBe("%PDF-");
    const receipt = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: co.body.data.payment.id } });
    expect(receipt.source).toBe("customer");
    expect(receipt.recipientName).toBe("Link Buyer");
    // A second download is not a re-issue; a tampered signature or expired link is refused.
    await customerReceipt(new Request(url), { params: { token: SEED_PAYMENT_LINK_TOKEN } });
    expect((await prisma.receipt.findUniqueOrThrow({ where: { paymentId: co.body.data.payment.id } })).reissueCount).toBe(0);
    url.searchParams.set("s", "tampered");
    expect((await customerReceipt(new Request(url), { params: { token: SEED_PAYMENT_LINK_TOKEN } })).status).toBe(403);
    expect(verifyCustomerReceiptQuery(SEED_PAYMENT_LINK_TOKEN, { p: co.body.data.payment.id, e: "1", s: "x" })).toBeNull();
  });
});

describe("K-3 invoices", () => {
  it("computes included tax per rate with the configured rounding", () => {
    expect(includedTax(1100, "standard10", "floor")).toBe(100);
    expect(includedTax(1000, "standard10", "floor")).toBe(90); // 90.9 → floor
    expect(includedTax(1000, "standard10", "round")).toBe(91);
    expect(includedTax(1000, "standard10", "ceil")).toBe(91);
    expect(includedTax(1000, "exempt", "floor")).toBe(0);
    const rows = summarizeTax([{ taxCategory: "standard10", amount: 1000 }, { taxCategory: "standard10", amount: 550 }, { taxCategory: "exempt", amount: 300 }], "floor");
    expect(rows).toEqual([
      { category: "standard10", ratePercent: 10, inclusive: 1550, tax: 140, exclusive: 1410 },
      { category: "exempt", ratePercent: 0, inclusive: 300, tax: 0, exclusive: 300 },
    ]);
  });

  it("validates the issuer registration number and the merchant's invoice number (T + 13 digits)", async () => {
    const base = { viewerCsvExport: false, slackWebhookUrl: "", issuerName: "Wire Pay Inc.", issuerAddress: "", issuerTel: "", taxRounding: "round" };
    expect((await read(await putGlobal(json("/api/global-settings", "PUT", { ...base, issuerRegistrationNo: "T123" }), {}))).status).toBe(400);
    const okRes = await read(await putGlobal(json("/api/global-settings", "PUT", { ...base, issuerRegistrationNo: "T1111111111111" }), {}));
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.taxRounding).toBe("round");
    expect((await read(await putGlobal(json("/api/global-settings", "PUT", { ...base, issuerRegistrationNo: "" }, ACCOUNTING), {}))).status).toBe(403);

    const settings = { settlementCycle: "monthly", payoutTerm: "next_month_end", bankName: "", bankBranch: "", bankAccountType: null, bankAccountNumber: "", bankAccountHolder: "", settlementFee: 0 };
    expect((await read(await patchSettlement(json(`/api/merchants/${SEED_IDS.merchant1}/settlement`, "PATCH", { ...settings, invoiceNumber: "12345", address: "x" }, ACCOUNTING), { params: { id: SEED_IDS.merchant1 } }))).status).toBe(400);
    const saved = await read(await patchSettlement(json(`/api/merchants/${SEED_IDS.merchant1}/settlement`, "PATCH", { ...settings, invoiceNumber: "T2222222222222", address: "Tokyo" }, ACCOUNTING), { params: { id: SEED_IDS.merchant1 } }));
    expect(saved.body.data).toMatchObject({ invoiceNumber: "T2222222222222", address: "Tokyo" });
  });

  it("exports the qualified invoice PDF for confirmed batches only, with tax categories on the lines (permission invoice.export)", async () => {
    // July: the Phase H sample transactions of merchant1 (the seed already holds an August batch).
    const gen = await read(await generateSettlement(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant1, from: "2026-07-01", to: "2026-07-31" }, ACCOUNTING), {}));
    expect(gen.status).toBe(201);
    const batchId = gen.body.data.id as string;
    const lines = await prisma.settlementLine.findMany({ where: { batchId } });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((l) => l.kind === "payment").every((l) => l.taxCategory === "standard10")).toBe(true);

    const get = (headers: Record<string, string>) => invoicePdf(new Request(`${BASE}/api/settlements/${batchId}/invoice`, { headers }), { params: { id: batchId } });
    expect((await get(ADMIN)).status).toBe(409); // collecting
    await settlementAction(json(`/api/settlements/${batchId}/confirm`, "POST", {}, ACCOUNTING), { params: { id: batchId, action: "confirm" } });
    expect((await get(CS)).status).toBe(403);
    const pdf = await get(ACCOUNTING);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("content-disposition")).toContain("invoice-INV-202607-00001.pdf");
    expect(await pdfHead(pdf)).toBe("%PDF-");
    expect(await prisma.auditLog.count({ where: { action: "settlement.invoice_export", targetId: batchId } })).toBe(1);
  });
});
