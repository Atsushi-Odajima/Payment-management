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

  it("ignores disabled rules and allow rules", async () => {
    await prisma.ipRestriction.update({ where: { id: SEED_IDS.ip4 }, data: { enabled: false } });
    expect((await checkAdminAccess((n) => (n === "x-forwarded-for" ? BLOCKED_IP : null))).blocked).toBe(false);
    // 203.0.113.10 is an allow rule: allow rules never block anyone.
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
