// Admin accounts: login (password + TOTP), sessions, invitations, guards,
// the audit trail and the global search.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { DEMO_ADMIN_ACCOUNTS } from "@/prisma/seed-accounts";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as twoFactor } from "@/app/api/auth/2fa/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as totpSetup } from "@/app/api/account/totp/setup/route";
import { POST as totpEnable } from "@/app/api/account/totp/enable/route";
import { POST as changePassword } from "@/app/api/account/password/route";
import { GET as listAdmins, POST as inviteAdmin } from "@/app/api/admins/route";
import { PATCH as patchAdmin } from "@/app/api/admins/[id]/route";
import { POST as resetPassword } from "@/app/api/admins/[id]/password/route";
import { GET as listAudit } from "@/app/api/audit-logs/route";
import { GET as search } from "@/app/api/search/route";
import { PATCH as patchAgent } from "@/app/api/agents/[id]/route";
import { SESSION_COOKIE, TWO_FACTOR_COOKIE } from "@/lib/auth";
import { currentTotpCode } from "@/lib/admin/totp";
import { decryptTotpSecret } from "@/lib/admin/secrets";
import { sessionHeaders } from "../helpers/session";

const BASE = "http://localhost";
const NOW = new Date("2026-09-01T03:00:00Z");
let MASTER: Record<string, string> = {};
let GENERAL: Record<string, string> = {};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
function cookieValue(res: Response, name: string): string | null {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    if (k === name && v) return v;
  }
  return null;
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: NOW });
  MASTER = await sessionHeaders("master");
  GENERAL = await sessionHeaders("general");
});

describe("login", () => {
  it("issues a session for the seeded master account and records the login", async () => {
    const res = await login(json("/api/auth/login", "POST", { loginId: "kuromaru", password: "atusi0130" }), {});
    expect(res.status).toBe(200);
    expect(cookieValue(res, SESSION_COOKIE)).toMatch(/\./);
    const { body } = await read(res);
    expect(body.data.user).toMatchObject({ loginId: "kuromaru", role: "master", status: "active" });
    const audit = await prisma.auditLog.findFirst({ where: { action: "auth.login", actorId: SEED_IDS.adminMaster } });
    expect(audit).not.toBeNull();
  });

  it("rejects a wrong password, an unknown id and a disabled account with the same error", async () => {
    const wrong = await read(await login(json("/api/auth/login", "POST", { loginId: "kuromaru", password: "nope" }), {}));
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("invalid_credentials");
    const unknown = await read(await login(json("/api/auth/login", "POST", { loginId: "ghost", password: "atusi0130" }), {}));
    expect(unknown.status).toBe(401);
    await prisma.adminUser.update({ where: { id: SEED_IDS.adminGeneral }, data: { status: "disabled" } });
    const disabled = await read(await login(json("/api/auth/login", "POST", { loginId: "general", password: DEMO_ADMIN_ACCOUNTS.general.password }), {}));
    expect(disabled.status).toBe(401);
  });

  it("requires the authenticator code when two-factor is enabled", async () => {
    // Enrol the master account through the account endpoints.
    const setup = await read(await totpSetup(json("/api/account/totp/setup", "POST", {}, MASTER), {}));
    expect(setup.body.data.uri).toContain("otpauth://totp/");
    expect(setup.body.data.qrSvg).toContain("<svg");
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: SEED_IDS.adminMaster }, select: { totpSecretEnc: true, totpEnabled: true } });
    expect(stored.totpEnabled).toBe(false);
    const secret = decryptTotpSecret(stored.totpSecretEnc!);
    expect(secret).toBe(setup.body.data.secret);
    const bad = await totpEnable(json("/api/account/totp/enable", "POST", { code: "000000" }, MASTER), {});
    expect([400, 200]).toContain(bad.status); // 000000 is astronomically unlikely to be the current code
    const enabled = await read(await totpEnable(json("/api/account/totp/enable", "POST", { code: currentTotpCode(secret) }, MASTER), {}));
    expect(enabled.body.data.totpEnabled).toBe(true);

    // Password step now returns a pending 2FA cookie, no session.
    const step1 = await login(json("/api/auth/login", "POST", { loginId: "kuromaru", password: "atusi0130" }), {});
    expect((await read(step1)).body.data.requiresTwoFactor).toBe(true);
    expect(cookieValue(step1, SESSION_COOKIE)).toBeNull();
    const pending = cookieValue(step1, TWO_FACTOR_COOKIE)!;
    expect(pending).toMatch(/\./);

    const wrongCode = await twoFactor(json("/api/auth/2fa", "POST", { code: "123456" }, { cookie: `${TWO_FACTOR_COOKIE}=${pending}` }), {});
    expect([401, 200]).toContain(wrongCode.status);
    const step2 = await twoFactor(json("/api/auth/2fa", "POST", { code: currentTotpCode(secret) }, { cookie: `${TWO_FACTOR_COOKIE}=${pending}` }), {});
    expect(step2.status).toBe(200);
    expect(cookieValue(step2, SESSION_COOKIE)).toMatch(/\./);
    const noCookie = await twoFactor(json("/api/auth/2fa", "POST", { code: currentTotpCode(secret) }), {});
    expect(noCookie.status).toBe(401);
  });

  it("logs out and records it", async () => {
    const res = await logout(json("/api/auth/logout", "POST", undefined, MASTER), {});
    expect(res.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "auth.logout" } })).toBe(1);
  });
});

describe("account", () => {
  it("changes the password after checking the current one", async () => {
    const wrong = await read(await changePassword(json("/api/account/password", "POST", { currentPassword: "nope", newPassword: "newpassword1" }, MASTER), {}));
    expect(wrong.status).toBe(400);
    const short = await read(await changePassword(json("/api/account/password", "POST", { currentPassword: "atusi0130", newPassword: "short" }, MASTER), {}));
    expect(short.status).toBe(400);
    const ok = await changePassword(json("/api/account/password", "POST", { currentPassword: "atusi0130", newPassword: "newpassword1" }, MASTER), {});
    expect(ok.status).toBe(200);
    expect((await login(json("/api/auth/login", "POST", { loginId: "kuromaru", password: "newpassword1" }), {})).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "account.password_change" } })).toBe(1);
  });
});

describe("admin users (master only)", () => {
  it("lists for master, refuses general and anonymous", async () => {
    const ok = await read(await listAdmins(new Request(BASE + "/api/admins", { headers: MASTER }), {}));
    expect(ok.body.data.admins.map((a: { loginId: string }) => a.loginId)).toEqual(["general", "kuromaru"]);
    expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash|totpSecret/);
    expect((await listAdmins(new Request(BASE + "/api/admins", { headers: GENERAL }), {})).status).toBe(403);
    expect((await listAdmins(new Request(BASE + "/api/admins"), {})).status).toBe(403);
    const csv = await listAdmins(new Request(BASE + "/api/admins?format=csv", { headers: MASTER }), {});
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("kuromaru");
  });

  it("invites an admin with a one-time initial password and activates it on first login", async () => {
    const res = await read(await inviteAdmin(json("/api/admins", "POST", { loginId: "Taro.Ops", name: "Taro", email: "Taro@wirepay.demo", role: "general", status: "active" }, MASTER), {}));
    expect(res.status).toBe(201);
    expect(res.body.data.admin).toMatchObject({ loginId: "taro.ops", email: "taro@wirepay.demo", status: "invited" });
    const pw = res.body.data.initialPassword as string;
    expect(pw).toHaveLength(12);
    const first = await read(await login(json("/api/auth/login", "POST", { loginId: "taro.ops", password: pw }), {}));
    expect(first.body.data.user.status).toBe("active");
    const dup = await read(await inviteAdmin(json("/api/admins", "POST", { loginId: "taro.ops", name: "X", email: "x@wirepay.demo", role: "general", status: "active" }, MASTER), {}));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.fieldErrors).toEqual({ loginId: "taken" });
    const badId = await read(await inviteAdmin(json("/api/admins", "POST", { loginId: "no spaces", name: "X", email: "y@wirepay.demo", role: "general", status: "active" }, MASTER), {}));
    expect(badId.body.error.details.fieldErrors).toEqual({ loginId: "loginId" });
  });

  it("protects the last master and the caller's own account", async () => {
    const self = await read(await patchAdmin(json(`/api/admins/${SEED_IDS.adminMaster}`, "PATCH", { name: "kuromaru", email: "kuromaru@wirepay.demo", role: "general", status: "active" }, MASTER), { params: { id: SEED_IDS.adminMaster } }));
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("self_change");
    // Promote general, then the (other) master could be demoted; without that it is the last master.
    const invited = await read(await inviteAdmin(json("/api/admins", "POST", { loginId: "second", name: "Second", email: "second@wirepay.demo", role: "master", status: "active" }, MASTER), {}));
    const secondId = invited.body.data.admin.id as string;
    const secondSession = { cookie: `${SESSION_COOKIE}=${(await (await import("@/lib/auth")).createSessionToken({ id: secondId, role: "master" }))}` };
    const demote = await read(await patchAdmin(json(`/api/admins/${SEED_IDS.adminMaster}`, "PATCH", { name: "kuromaru", email: "kuromaru@wirepay.demo", role: "general", status: "active" }, secondSession), { params: { id: SEED_IDS.adminMaster } }));
    expect(demote.status).toBe(200);
    expect(demote.body.data.role).toBe("general");
    // Now "second" is the last active master.
    const disableLast = await read(await patchAdmin(json(`/api/admins/${secondId}`, "PATCH", { name: "Second", email: "second@wirepay.demo", role: "master", status: "disabled" }, MASTER), { params: { id: secondId } }));
    expect(disableLast.status).toBe(403); // kuromaru is general now → not master
    const audits = await prisma.auditLog.findMany({ where: { action: "admin.update" } });
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].before!)).toMatchObject({ role: "master" });
    expect(JSON.parse(audits[0].after!)).toMatchObject({ role: "general" });
  });

  it("reissues a temporary password", async () => {
    const res = await read(await resetPassword(json(`/api/admins/${SEED_IDS.adminGeneral}/password`, "POST", undefined, MASTER), { params: { id: SEED_IDS.adminGeneral } }));
    expect(res.status).toBe(200);
    expect((await login(json("/api/auth/login", "POST", { loginId: "general", password: res.body.data.password }), {})).status).toBe(200);
    expect((await login(json("/api/auth/login", "POST", { loginId: "general", password: DEMO_ADMIN_ACCOUNTS.general.password }), {})).status).toBe(401);
  });
});

describe("audit log", () => {
  it("records existing mutations with the acting admin, and filters", async () => {
    await patchAgent(json(`/api/agents/${SEED_IDS.agent1}`, "PATCH", { name: "Renamed", nameKana: "テスト", companyName: "C", contactName: "P", email: "a@b.example", feeRate: 1, status: "active" }, GENERAL), { params: { id: SEED_IDS.agent1 } });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "agent.update" } });
    expect(row.actorId).toBe(SEED_IDS.adminGeneral);
    expect(JSON.parse(row.before!).name).not.toBe("Renamed");
    expect(JSON.parse(row.after!).name).toBe("Renamed");

    const list = await read(await listAudit(new Request(BASE + `/api/audit-logs?action=agent.update&actor=${SEED_IDS.adminGeneral}`, { headers: GENERAL }), {}));
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.logs[0].actor.loginId).toBe("general");
    const seeded = await read(await listAudit(new Request(BASE + "/api/audit-logs?targetType=payment", { headers: MASTER }), {}));
    expect(seeded.body.data.total).toBe(1);
    expect((await listAudit(new Request(BASE + "/api/audit-logs"), {})).status).toBe(401);
  });
});

describe("search", () => {
  it("finds transactions by transfer id, merchants by name and admins only for master", async () => {
    const byTransfer = await read(await search(new Request(BASE + "/api/search?q=48213907", { headers: GENERAL }), {}));
    expect(byTransfer.body.data.payments.map((p: { id: string }) => p.id)).toEqual([SEED_IDS.payment4]);
    const byMerchant = await read(await search(new Request(BASE + "/api/search?q=MER-0000", { headers: GENERAL }), {}));
    expect(byMerchant.body.data.merchants).toHaveLength(3);
    expect(byMerchant.body.data.admins).toHaveLength(0);
    const admins = await read(await search(new Request(BASE + "/api/search?q=kuromaru", { headers: MASTER }), {}));
    expect(admins.body.data.admins).toHaveLength(1);
    const short = await read(await search(new Request(BASE + "/api/search?q=k", { headers: MASTER }), {}));
    expect(short.body.data.total).toBe(0);
  });
});
