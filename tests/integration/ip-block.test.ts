// Enforcement of admin "deny" IP rules on API routes, and the guard that
// stops an operator from blocking their own address.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sessionHeaders } from "../helpers/session";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listAgents } from "@/app/api/agents/route";
import { POST as createRule } from "@/app/api/ip-restrictions/route";
import { PATCH as patchRule } from "@/app/api/ip-restrictions/[id]/route";
import { POST as webhook } from "@/app/api/webhooks/[providerId]/route";
import { checkAdminAccess } from "@/lib/ip-restrictions/enforce";
import { DELETE as deleteRule } from "@/app/api/ip-restrictions/[id]/route";
import { PUT as putAllowlist, GET as getAllowlist } from "@/app/api/ip-restrictions/allowlist/route";
import { GET as ping } from "@/app/api/merchant-api/ping/route";
import { SEED_API_KEYS } from "@/prisma/seed-data";

const BASE = "http://localhost";
let ADMIN: Record<string, string> = {};
const BLOCKED_IP = "203.0.113.200"; // seeded deny rule

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...ADMIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: new Date("2026-09-01T03:00:00Z") });
  ADMIN = await sessionHeaders("admin");
});

describe("admin IP block list", () => {
  it("answers 403 on admin API routes for a blocked caller and lets others through", async () => {
    const blocked = await read(await listAgents(new Request(BASE + "/api/agents", { headers: { "x-forwarded-for": `${BLOCKED_IP}, 10.0.0.1` } }), {}));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("ip_blocked");

    const fine = await listAgents(new Request(BASE + "/api/agents", { headers: { "x-forwarded-for": "203.0.113.10" } }), {});
    expect(fine.status).toBe(200);
    const noHeader = await listAgents(new Request(BASE + "/api/agents"), {});
    expect(noHeader.status).toBe(200);
  });

  it("ignores disabled rules and, while allow-list mode is off, allow rules", async () => {
    await prisma.ipRestriction.update({ where: { id: SEED_IDS.ip4 }, data: { enabled: false } });
    expect((await checkAdminAccess((n) => (n === "x-forwarded-for" ? BLOCKED_IP : null))).blocked).toBe(false);
    // 203.0.113.10 is an allow rule: with the mode off, allow rules block nobody.
    expect((await checkAdminAccess((n) => (n === "x-forwarded-for" ? "203.0.113.10" : null))).blocked).toBe(false);
    expect((await checkAdminAccess((n) => (n === "x-forwarded-for" ? "192.0.2.1" : null))).blocked).toBe(false);
  });

  it("does not apply to PSP webhooks", async () => {
    const res = await webhook(json(`/api/webhooks/${SEED_IDS.stripeProvider}`, "POST", {}, { "x-forwarded-for": BLOCKED_IP }), {
      params: { providerId: SEED_IDS.stripeProvider },
    });
    expect(res.status).not.toBe(403);
  });

  it("refuses a deny rule that would block the caller's own IP", async () => {
    const self = await read(
      await createRule(json("/api/ip-restrictions", "POST", { target: "admin", mode: "deny", cidr: "10.0.0.0/8", label: "oops" }, { "x-forwarded-for": "10.1.2.3" }), {}),
    );
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("ip_self_block");
    expect(self.body.error.details.fieldErrors).toEqual({ cidr: "selfBlock" });

    // Same range as an allow rule, or as a disabled deny rule, is fine.
    const allow = await createRule(json("/api/ip-restrictions", "POST", { target: "admin", mode: "allow", cidr: "10.0.0.0/8", label: "ok" }, { "x-forwarded-for": "10.1.2.3" }), {});
    expect(allow.status).toBe(201);
    const disabled = await read(
      await createRule(json("/api/ip-restrictions", "POST", { target: "admin", mode: "deny", cidr: "10.0.0.0/8", label: "later", enabled: false }, { "x-forwarded-for": "10.1.2.3" }), {}),
    );
    expect(disabled.status).toBe(201);

    // Enabling it later through PATCH is refused too.
    const enable = await patchRule(
      json(`/api/ip-restrictions/${disabled.body.data.id}`, "PATCH", { target: "admin", mode: "deny", cidr: "10.0.0.0/8", label: "later", enabled: true }, { "x-forwarded-for": "10.1.2.3" }),
      { params: { id: disabled.body.data.id } },
    );
    expect(enable.status).toBe(400);
  });

  it("blocks a newly added deny rule immediately", async () => {
    const created = await createRule(json("/api/ip-restrictions", "POST", { target: "admin", mode: "deny", cidr: "198.51.100.77", label: "bad actor" }, { "x-forwarded-for": "203.0.113.10" }), {});
    expect(created.status).toBe(201);
    const res = await listAgents(new Request(BASE + "/api/agents", { headers: { "x-real-ip": "198.51.100.77" } }), {});
    expect(res.status).toBe(403);
  });
});

describe("allow-list mode (Phase P4-1)", () => {
  const put = async (body: unknown, headers: Record<string, string> = {}) => read(await putAllowlist(json("/api/ip-restrictions/allowlist", "PUT", body, { ...ADMIN, ...headers }), {}));
  const IN_LIST = "203.0.113.10"; // seeded admin allow rule (ip1)
  const OUTSIDE = "192.0.2.1";

  it("admin: refuses to turn on without allow rules or from an address off the list, then enforces", async () => {
    // Off by default; allow rules informational.
    const status = await read(await getAllowlist(new Request(BASE + "/api/ip-restrictions/allowlist"), {}));
    expect(status.body.data.admin).toEqual({ enabled: false, allowRules: 2 });
    // From an address outside the seeded allow rules → self lock-out refused.
    const self = await put({ target: "admin", enabled: true }, { "x-forwarded-for": OUTSIDE });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("ip_self_block");
    // Without any allow rule the mode cannot be turned on at all.
    await prisma.ipRestriction.updateMany({ where: { target: "admin", mode: "allow" }, data: { enabled: false } });
    const none = await put({ target: "admin", enabled: true }, { "x-forwarded-for": IN_LIST });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe("allowlist_no_rules");
    await prisma.ipRestriction.updateMany({ where: { target: "admin", mode: "allow" }, data: { enabled: true } });
    // From an allowed address → on.
    const on = await put({ target: "admin", enabled: true }, { "x-forwarded-for": IN_LIST });
    expect(on.status).toBe(200);
    expect(on.body.data.admin.enabled).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "global_setting.update" } })).toBe(1);

    // Enforced: outside → 403 not_in_allowlist (API and page check), inside → fine, deny still wins.
    const blocked = await read(await listAgents(new Request(BASE + "/api/agents", { headers: { "x-forwarded-for": OUTSIDE } }), {}));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("ip_blocked");
    expect(blocked.body.error.details.reason).toBe("not_in_allowlist");
    expect(await checkAdminAccess((n) => (n === "x-forwarded-for" ? OUTSIDE : null))).toMatchObject({ blocked: true, reason: "not_in_allowlist" });
    expect((await listAgents(new Request(BASE + "/api/agents", { headers: { "x-forwarded-for": IN_LIST } }), {})).status).toBe(200);
    expect(await checkAdminAccess((n) => (n === "x-forwarded-for" ? BLOCKED_IP : null))).toMatchObject({ blocked: true, reason: "deny" });
    // No header → cannot evaluate → not blocked (unchanged).
    expect((await listAgents(new Request(BASE + "/api/agents"), {})).status).toBe(200);

    // While on: removing the rule that covers the operator is refused; a change that keeps coverage is fine.
    const del = await read(await deleteRule(json(`/api/ip-restrictions/${SEED_IDS.ip1}`, "DELETE", undefined, { ...ADMIN, "x-forwarded-for": IN_LIST }), { params: { id: SEED_IDS.ip1 } }));
    expect(del.status).toBe(400);
    expect(del.body.error.code).toBe("ip_self_block");
    const shrink = await read(await patchRule(json(`/api/ip-restrictions/${SEED_IDS.ip1}`, "PATCH", { target: "admin", mode: "allow", cidr: "203.0.113.11", label: "moved", enabled: true }, { ...ADMIN, "x-forwarded-for": IN_LIST }), { params: { id: SEED_IDS.ip1 } }));
    expect(shrink.status).toBe(400);
    // The VPN range (ip2) does not cover 203.0.113.10, but deleting ip2 is fine because ip1 still does.
    expect((await deleteRule(json(`/api/ip-restrictions/${SEED_IDS.ip2}`, "DELETE", undefined, { ...ADMIN, "x-forwarded-for": IN_LIST }), { params: { id: SEED_IDS.ip2 } })).status).toBe(200);

    // Off again from an allowed address; allow rules are informational once more.
    expect((await put({ target: "admin", enabled: false }, { "x-forwarded-for": IN_LIST })).status).toBe(200);
    expect((await listAgents(new Request(BASE + "/api/agents", { headers: { "x-forwarded-for": OUTSIDE } }), {})).status).toBe(200);
  });

  it("merchant API: enforces each merchant's own allow rules; merchants without rules are unaffected", async () => {
    const key = SEED_API_KEYS[SEED_IDS.apiKey1]; // merchant1; seeded allow rule 192.0.2.0/28 is disabled
    const bearer = (ip: string, k: string = key) => new Request(BASE + "/api/merchant-api/ping", { headers: { authorization: `Bearer ${k}`, "x-forwarded-for": ip } });
    expect((await put({ target: "merchant_api", enabled: true }, { "x-forwarded-for": IN_LIST })).body.error.code).toBe("allowlist_no_rules");
    await prisma.ipRestriction.update({ where: { id: SEED_IDS.ip3 }, data: { enabled: true } });
    expect((await put({ target: "merchant_api", enabled: true }, { "x-forwarded-for": IN_LIST })).status).toBe(200);
    const off = await read(await ping(bearer("198.51.100.7"), {}));
    expect(off.status).toBe(403);
    expect(off.body.error.details.reason).toBe("not_in_allowlist");
    expect((await ping(bearer("192.0.2.5"), {})).status).toBe(200);
    // merchant2 has no allow rules → any address works; a live key of merchant1 follows the same rules.
    expect((await ping(bearer("198.51.100.7", SEED_API_KEYS[SEED_IDS.apiKey2]), {})).status).toBe(403);
    await prisma.apiKey.update({ where: { id: SEED_IDS.apiKey4 }, data: { revokedAt: null } });
    expect((await ping(bearer("198.51.100.7", SEED_API_KEYS[SEED_IDS.apiKey4]), {})).status).toBe(200);
    // Off again → informational.
    expect((await put({ target: "merchant_api", enabled: false }, { "x-forwarded-for": IN_LIST })).status).toBe(200);
    expect((await ping(bearer("198.51.100.7"), {})).status).toBe(200);
  });
});
