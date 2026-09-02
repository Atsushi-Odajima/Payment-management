import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listRules, POST as createRule } from "@/app/api/ip-restrictions/route";
import { DELETE as deleteRule, GET as getRule, PATCH as patchRule } from "@/app/api/ip-restrictions/[id]/route";

const BASE = "http://localhost";

function json(path: string, method: string, body?: unknown) {
  return new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const ctx = (id: string) => ({ params: { id } });

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: new Date("2026-09-01T03:00:00Z") });
});

describe("IP restrictions API", () => {
  it("lists seeded rules", async () => {
    const { body } = await read(await listRules(new Request(BASE + "/api/ip-restrictions"), {}));
    expect(body.data.rules).toHaveLength(4);
    expect(body.data.rules.filter((r: { target: string }) => r.target === "admin")).toHaveLength(3);
    expect(body.data.rules.filter((r: { mode: string }) => r.mode === "deny")).toHaveLength(1);
  });

  it("normalizes CIDR host bits and drops the merchant for admin rules", async () => {
    const { status, body } = await read(
      await createRule(json("/api/ip-restrictions", "POST", { target: "admin", merchantId: SEED_IDS.merchant1, cidr: "10.1.2.3/24", label: "Office" }), {}),
    );
    expect(status).toBe(201);
    expect(body.data.cidr).toBe("10.1.2.0/24");
    expect(body.data.merchantId).toBeNull();
    expect(body.data.enabled).toBe(true);
  });

  it("validates the address and requires a merchant for merchant-API rules", async () => {
    const bad = await read(await createRule(json("/api/ip-restrictions", "POST", { target: "merchant_api", cidr: "999.1.1.1", label: "x" }), {}));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fieldErrors).toEqual({ cidr: "cidr", merchantId: "required" });

    const unknownMerchant = await read(
      await createRule(json("/api/ip-restrictions", "POST", { target: "merchant_api", merchantId: "mer_nope", cidr: "192.0.2.1", label: "x" }), {}),
    );
    expect(unknownMerchant.status).toBe(400);
    expect(unknownMerchant.body.error.details.fieldErrors).toEqual({ merchantId: "invalid" });
  });

  it("updates and deletes a rule", async () => {
    const upd = await read(
      await patchRule(
        json(`/api/ip-restrictions/${SEED_IDS.ip3}`, "PATCH", { target: "merchant_api", merchantId: SEED_IDS.merchant1, cidr: "192.0.2.0/28", label: "Prod", enabled: true }),
        ctx(SEED_IDS.ip3),
      ),
    );
    expect(upd.status).toBe(200);
    expect(upd.body.data.enabled).toBe(true);
    expect(upd.body.data.label).toBe("Prod");

    const del = await read(await deleteRule(new Request(BASE + "/x", { method: "DELETE" }), ctx(SEED_IDS.ip3)));
    expect(del.status).toBe(200);
    const gone = await read(await getRule(new Request(BASE + "/x"), ctx(SEED_IDS.ip3)));
    expect(gone.status).toBe(404);
    const { body } = await read(await listRules(new Request(BASE + "/api/ip-restrictions"), {}));
    expect(body.data.rules).toHaveLength(3);
  });
});
