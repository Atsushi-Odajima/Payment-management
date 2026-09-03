// Phase I-1: the five roles, the permission matrix in lib/role.ts and its
// enforcement on the API (server-side, independent of the client UI).

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { DEMO_ADMIN_ACCOUNTS } from "@/prisma/seed-accounts";
import { ROLES, can, describeRole, normalizeRole, rolesFor } from "@/lib/role";
import { POST as createMerchant } from "@/app/api/merchants/route";
import { POST as generateSettlement } from "@/app/api/settlements/generate/route";
import { POST as resendWebhook } from "@/app/api/webhook-logs/[id]/resend/route";
import { POST as approveRefund } from "@/app/api/refunds/[id]/approve/route";
import { GET as listAdmins, POST as inviteAdmin } from "@/app/api/admins/route";
import { GET as listMerchants } from "@/app/api/merchants/route";
import { GET as globalSettings, PUT as putGlobalSettings } from "@/app/api/global-settings/route";
import { GET as listPaymentLinks } from "@/app/api/payment-links/route";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
const H: Record<string, Record<string, string>> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  for (const r of ROLES) H[r] = await sessionHeaders(r);
});

describe("role matrix", () => {
  it("normalizes legacy names and treats unknown values as viewer", () => {
    expect(normalizeRole("master")).toBe("admin");
    expect(normalizeRole("general")).toBe("cs");
    expect(normalizeRole("accounting")).toBe("accounting");
    expect(normalizeRole("nope")).toBe("viewer");
    expect(normalizeRole(undefined)).toBe("viewer");
  });

  it("admin can do everything, viewer can only view", () => {
    for (const r of describeRole("viewer")) {
      expect(r.actions.every((a) => a === "view" || (r.resource === "account" && a === "update"))).toBe(true);
    }
    expect(rolesFor("admin_user", "update")).toEqual(["admin"]);
    expect(can("accounting", "settlement", "transition")).toBe(true);
    expect(can("cs", "settlement", "transition")).toBe(false);
    expect(can("developer", "webhook", "resend")).toBe(true);
    expect(can("cs", "webhook", "resend")).toBe(false);
    expect(can("cs", "refund", "request")).toBe(true);
    expect(can("cs", "refund", "decide")).toBe(false);
    expect(can("viewer", "csv", "export")).toBe(false);
    expect(can(null, "payment", "view")).toBe(false);
  });

  it("seeds one demo account per role and migrated the legacy rows", async () => {
    const rows = await prisma.adminUser.findMany({ select: { id: true, role: true } });
    expect(new Set(rows.map((r) => r.role))).toEqual(new Set(ROLES));
    expect(rows.find((r) => r.id === SEED_IDS.adminMaster)?.role).toBe("admin");
    expect(rows.find((r) => r.id === SEED_IDS.adminGeneral)?.role).toBe("cs");
    // The seed migration is idempotent and also fixes rows written with the old names.
    await prisma.adminUser.update({ where: { id: DEMO_ADMIN_ACCOUNTS.viewer.id }, data: { role: "general" } });
    await seed(prisma, { now: NOW });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: DEMO_ADMIN_ACCOUNTS.viewer.id } })).role).toBe("cs");
  });
});

describe("API enforcement", () => {
  const merchantBody = { siteName: "Role Shop", siteNameKana: "ロールショップ", companyName: "Role Inc", contactName: "R", email: "role@example.com", statementEmail: "role@example.com", notifyUrl: "https://example.com/n", notifyFormat: "json_post", notifyParamSet: "standard", notifyIdFormat: "payment_id", emailNotification: "none", enabledMethods: ["credit"], transferIdDigits: 7 };

  it("merchant creation: admin and cs may, accounting / developer / viewer get 403, anonymous 401", async () => {
    expect((await read(await createMerchant(json("/api/merchants", "POST", merchantBody), {}))).status).toBe(401);
    for (const r of ["accounting", "developer", "viewer"] as const) {
      const res = await read(await createMerchant(json("/api/merchants", "POST", merchantBody, H[r]), {}));
      expect(res.status, r).toBe(403);
      expect(res.body.error.code).toBe("permission_required");
    }
    expect((await read(await createMerchant(json("/api/merchants", "POST", { ...merchantBody, email: "a@example.com" }, H.cs), {}))).status).toBe(201);
    expect((await read(await createMerchant(json("/api/merchants", "POST", { ...merchantBody, email: "b@example.com" }, H.admin), {}))).status).toBe(201);
  });

  it("settlement generation is admin / accounting, webhook resend is admin / developer, refund decisions are admin / accounting", async () => {
    const gen = async (h: Record<string, string>) => read(await generateSettlement(json("/api/settlements/generate?mode=test", "POST", { merchantId: SEED_IDS.merchant2, from: "2026-07-01", to: "2026-07-31" }, h), {}));
    expect((await gen(H.cs)).status).toBe(403);
    expect((await gen(H.developer)).status).toBe(403);
    expect((await gen(H.accounting)).status).toBe(201);

    const resend = async (h: Record<string, string>) => read(await resendWebhook(json(`/api/webhook-logs/${SEED_IDS.webhook2}/resend`, "POST", {}, h), { params: { id: SEED_IDS.webhook2 } }));
    expect((await resend(H.accounting)).status).toBe(403);
    expect((await resend(H.cs)).status).toBe(403);
    expect((await resend(H.developer)).status).toBe(200);

    const approve = async (h: Record<string, string>) => read(await approveRefund(json(`/api/refunds/${SEED_IDS.refund1}/approve`, "POST", { note: "ok" }, h), { params: { id: SEED_IDS.refund1 } }));
    expect((await approve(H.cs)).status).toBe(403);
    expect((await approve(H.viewer)).status).toBe(403);
    expect((await approve(H.accounting)).status).toBe(200);
  });

  it("admin management and global settings are admin only", async () => {
    for (const r of ["accounting", "cs", "developer", "viewer"] as const) {
      expect((await read(await listAdmins(new Request(BASE + "/api/admins", { headers: H[r] }), {}))).status, r).toBe(403);
      expect((await read(await globalSettings(new Request(BASE + "/api/global-settings", { headers: H[r] }), {}))).status, r).toBe(403);
    }
    const invited = await read(await inviteAdmin(json("/api/admins", "POST", { loginId: "acct2", name: "Acct", email: "acct2@wirepay.demo", role: "accounting", status: "active" }, H.admin), {}));
    expect(invited.status).toBe(201);
    expect(invited.body.data.admin.role).toBe("accounting");
    expect((await read(await putGlobalSettings(json("/api/global-settings", "PUT", { viewerCsvExport: true }, H.admin), {}))).status).toBe(200);
  });

  it("CSV export follows csv.export and the viewer global setting", async () => {
    const csv = (h: Record<string, string>) => listMerchants(new Request(BASE + "/api/merchants?format=csv", { headers: h }), {});
    expect((await csv(H.viewer)).status).toBe(403);
    expect((await csv({})).status).toBe(403);
    expect((await csv(H.cs)).status).toBe(200);
    await read(await putGlobalSettings(json("/api/global-settings", "PUT", { viewerCsvExport: true }, H.admin), {}));
    expect((await csv(H.viewer)).status).toBe(200);
    expect((await listPaymentLinks(new Request(BASE + "/api/payment-links?mode=test&format=csv", { headers: H.viewer }), {})).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "global_setting.update" } })).toBe(1);
  });
});
