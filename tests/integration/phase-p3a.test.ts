// Phase P3 (operations screens, first half):
//   3-1 CSV file names carry the mode
//   3-2 ?overdue=1 filter (covered in transactions.test.ts as well)
//   3-3 transaction detail lists related deposit notifications / unmatched deposits
//   3-4 deposit differences link to the refund request / top-up e-mail they produced

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listDepositDiffs } from "@/app/api/deposit-diffs/route";
import { POST as depositDiffAction } from "@/app/api/deposit-diffs/[id]/[action]/route";
import { GET as listRefunds } from "@/app/api/refunds/route";
import { csvResponse } from "@/lib/csv";
import { loadTransactionDetail } from "@/lib/payments/detail";
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

beforeEach(async () => {
  vi.stubEnv("DEPOSIT_NOTIFY_SECRET", "");
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  ADMIN = await sessionHeaders("admin");
});

describe("P3-1 mode in CSV file names", () => {
  it("inserts -test / -live before .csv", async () => {
    expect(csvResponse("a", "refunds.csv", "live").headers.get("content-disposition")).toBe('attachment; filename="refunds-live.csv"');
    expect(csvResponse("a", "report-summary-2026-08-01-2026-08-31.csv", "test").headers.get("content-disposition")).toContain("report-summary-2026-08-01-2026-08-31-test.csv");
    expect(csvResponse("a", "audit-logs.csv").headers.get("content-disposition")).toContain('filename="audit-logs.csv"');
    const res = await listRefunds(new Request(BASE + "/api/refunds?mode=live&format=csv", { headers: ADMIN }), {});
    expect(res.headers.get("content-disposition")).toContain("refunds-live.csv");
  });
});

describe("P3-3 related deposits on the transaction detail", () => {
  it("lists the notifications that named the transaction and the unmatched deposits linked to it", async () => {
    // Seed: DN-00004 (late deposit for ORD-DEMO-016) and unmatched3 linked to payment16.
    const detail = await loadTransactionDetail(SEED_IDS.payment16);
    expect(detail).not.toBeNull();
    expect(detail!.depositNotifications.map((n) => n.notificationNo)).toContain("DN-00004");
    expect(detail!.depositNotifications[0]).toMatchObject({ source: "bank", amount: 12_000, result: "unmatched", resultReason: "late_deposit", unmatchedDepositId: SEED_IDS.unmatched3 });
    expect(detail!.unmatchedCandidates).toEqual([expect.objectContaining({ id: SEED_IDS.unmatched3, amount: 12_000, match: "linked" })]);
    // A card payment has neither.
    const card = await loadTransactionDetail(SEED_IDS.payment1);
    expect(card!.depositNotifications).toEqual([]);
    expect(card!.unmatchedCandidates).toEqual([]);
  });

  it("matches open unmatched deposits by the transfer id the customer wrote", async () => {
    await prisma.unmatchedDeposit.update({ where: { id: SEED_IDS.unmatched1 }, data: { givenTransferId: "7301256" } }); // payment5's id
    const detail = await loadTransactionDetail(SEED_IDS.payment5);
    expect(detail!.unmatchedCandidates.map((u) => [u.id, u.match])).toEqual([[SEED_IDS.unmatched1, "given_id"]]);
  });
});

describe("P3-4 deposit difference links", () => {
  it("exposes the refund request and the top-up e-mail created by the follow-up actions", async () => {
    const before = await read(await listDepositDiffs(new Request(BASE + "/api/deposit-diffs?mode=live"), {}));
    const excess = before.body.data.items.find((r: { diff: string }) => r.diff === "excess");
    const short = before.body.data.items.find((r: { diff: string }) => r.diff === "short");
    expect(excess.refund).toBeNull();
    expect(short.emailLog).toBeNull();

    expect((await depositDiffAction(json(`/api/deposit-diffs/${excess.id}/refund`, "POST", {}, ADMIN), { params: { id: excess.id, action: "refund" } })).status).toBe(200);
    expect((await depositDiffAction(json(`/api/deposit-diffs/${short.id}/notify`, "POST", {}, ADMIN), { params: { id: short.id, action: "notify" } })).status).toBe(200);

    const after = await read(await listDepositDiffs(new Request(BASE + "/api/deposit-diffs?mode=live"), {}));
    const excessRow = after.body.data.items.find((r: { id: string }) => r.id === excess.id);
    const shortRow = after.body.data.items.find((r: { id: string }) => r.id === short.id);
    const refund = await prisma.refund.findFirstOrThrow({ where: { paymentId: excess.id, reasonCode: "duplicate" } });
    expect(excessRow.refund).toEqual({ id: refund.id, status: "requested" });
    const mail = await prisma.emailLog.findFirstOrThrow({ where: { paymentId: short.id, templateKey: "deposit_short" } });
    expect(shortRow.emailLog.id).toBe(mail.id);
  });
});
