import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, SEED_MERCHANT_PASSWORDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listMerchants, POST as createMerchant } from "@/app/api/merchants/route";
import { GET as getMerchant, PATCH as patchMerchant } from "@/app/api/merchants/[id]/route";
import { GET as getPassword, POST as regeneratePassword } from "@/app/api/merchants/[id]/password/route";

const BASE = "http://localhost";
const KANA = "テスト ショップ";

const validBody = {
  siteName: "Test Shop",
  siteNameKana: KANA,
  companyName: "Test Inc.",
  contactName: "Taro Test",
  email: "info@test.example.jp",
  statementEmail: "info@test.example.jp",
  notifyUrl: "https://test.example.jp/notify",
  notifyFormat: "json_post",
  notifyParamSet: "standard",
  notifyIdFormat: "payment_id",
  emailNotification: "per_payment",
};

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const asRole = (role: "master" | "general") => ({ cookie: `wirepay.role=${role}` });
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { force: true, now: new Date("2026-09-01T03:00:00Z") });
});

describe("merchants API", () => {
  it("lists merchants without the password", async () => {
    const { body } = await read(await listMerchants(new Request(BASE + "/api/merchants"), {}));
    expect(body.data.merchants).toHaveLength(3);
    expect(JSON.stringify(body)).not.toMatch(/password/i);
    expect(body.data.merchants[0].merchantCode).toBe("MER-00001");
  });

  it("auto-numbers the next merchant code and never returns the password", async () => {
    const { status, body } = await read(await createMerchant(json("/api/merchants", "POST", validBody), {}));
    expect(status).toBe(201);
    expect(body.data.merchantCode).toBe("MER-00004");
    expect(JSON.stringify(body)).not.toMatch(/password/i);
    const row = await prisma.merchant.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(row.passwordEnc.split(":")).toHaveLength(3); // encrypted, not plaintext
  });

  it("returns per-field error codes for invalid input", async () => {
    const { status, body } = await read(
      await createMerchant(
        json("/api/merchants", "POST", { ...validBody, siteNameKana: "hiragana", email: "nope", notifyUrl: "http://x.example" }),
        {},
      ),
    );
    expect(status).toBe(400);
    expect(body.error.details.fieldErrors).toEqual({ siteNameKana: "katakana", email: "email", notifyUrl: "https" });
  });

  it("updates editable fields but not the code", async () => {
    const res = await patchMerchant(
      json(`/api/merchants/${SEED_IDS.merchant1}`, "PATCH", { ...validBody, siteName: "Renamed", merchantCode: "MER-99999" }),
      { params: { id: SEED_IDS.merchant1 } },
    );
    const { status, body } = await read(res);
    expect(status).toBe(200);
    expect(body.data.siteName).toBe("Renamed");
    expect(body.data.merchantCode).toBe("MER-00001");
    const fetched = await read(await getMerchant(new Request(BASE + "/x"), { params: { id: SEED_IDS.merchant1 } }));
    expect(fetched.body.data.siteName).toBe("Renamed");
  });

  it("reveals the password only to the master role", async () => {
    const denied = await read(
      await getPassword(new Request(BASE + "/x", { headers: asRole("general") }), { params: { id: SEED_IDS.merchant1 } }),
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("role_required");

    const noCookie = await read(await getPassword(new Request(BASE + "/x"), { params: { id: SEED_IDS.merchant1 } }));
    expect(noCookie.status).toBe(403);

    const ok = await read(
      await getPassword(new Request(BASE + "/x", { headers: asRole("master") }), { params: { id: SEED_IDS.merchant1 } }),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data.password).toBe(SEED_MERCHANT_PASSWORDS[SEED_IDS.merchant1]);
  });

  it("regenerates the password for the master role", async () => {
    const before = SEED_MERCHANT_PASSWORDS[SEED_IDS.merchant2];
    const denied = await regeneratePassword(new Request(BASE + "/x", { method: "POST", headers: asRole("general") }), {
      params: { id: SEED_IDS.merchant2 },
    });
    expect(denied.status).toBe(403);

    const res = await read(
      await regeneratePassword(new Request(BASE + "/x", { method: "POST", headers: asRole("master") }), {
        params: { id: SEED_IDS.merchant2 },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.password).toHaveLength(16);
    expect(res.body.data.password).not.toBe(before);

    const again = await read(
      await getPassword(new Request(BASE + "/x", { headers: asRole("master") }), { params: { id: SEED_IDS.merchant2 } }),
    );
    expect(again.body.data.password).toBe(res.body.data.password);
  });
});
