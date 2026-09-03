import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sessionHeaders } from "../helpers/session";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { GET as listAgents, POST as createAgent } from "@/app/api/agents/route";
import { GET as getAgent, PATCH as patchAgent } from "@/app/api/agents/[id]/route";
import { POST as createMerchant } from "@/app/api/merchants/route";

const BASE = "http://localhost";
let ADMIN: Record<string, string> = {};

const validAgent = {
  name: "Test Agency",
  nameKana: "テスト エージェンシー",
  companyName: "Test Agency Inc.",
  contactName: "Hanako Test",
  email: "agency@test.example.jp",
  feeRate: 3.25,
  status: "active",
};

const validMerchant = {
  siteName: "Agent Linked Shop",
  siteNameKana: "エージェント ショップ",
  companyName: "Linked Inc.",
  contactName: "Taro Test",
  email: "linked@test.example.jp",
  statementEmail: "linked@test.example.jp",
  notifyUrl: "https://linked.example.jp/notify",
  notifyFormat: "json_post",
  notifyParamSet: "standard",
  notifyIdFormat: "payment_id",
  emailNotification: "per_payment",
};

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

describe("agents API", () => {
  it("lists seeded agents in code order with merchant counts", async () => {
    const { body } = await read(await listAgents(new Request(BASE + "/api/agents"), {}));
    expect(body.data.agents).toHaveLength(2);
    expect(body.data.agents[0].agentCode).toBe("AGT-00001");
    expect(body.data.agents[0]._count.merchants).toBeGreaterThan(0);
  });

  it("auto-numbers the next agent code", async () => {
    const { status, body } = await read(await createAgent(json("/api/agents", "POST", validAgent), {}));
    expect(status).toBe(201);
    expect(body.data.agentCode).toBe("AGT-00003");
    expect(body.data.feeRate).toBe(3.25);
  });

  it("returns per-field error codes for invalid input", async () => {
    const { status, body } = await read(
      await createAgent(
        json("/api/agents", "POST", { ...validAgent, nameKana: "hiragana", email: "nope", feeRate: 100.5 }),
        {},
      ),
    );
    expect(status).toBe(400);
    expect(body.error.details.fieldErrors).toEqual({ nameKana: "katakana", email: "email", feeRate: "range" });
  });

  it("rejects fee rates with more than two decimals", async () => {
    const { status, body } = await read(await createAgent(json("/api/agents", "POST", { ...validAgent, feeRate: 3.256 }), {}));
    expect(status).toBe(400);
    expect(body.error.details.fieldErrors).toEqual({ feeRate: "decimals" });
  });

  it("updates editable fields but never the code", async () => {
    const res = await patchAgent(
      json(`/api/agents/${SEED_IDS.agent1}`, "PATCH", { ...validAgent, name: "Renamed Agency", status: "disabled", agentCode: "AGT-99999" }),
      { params: { id: SEED_IDS.agent1 } },
    );
    const { status, body } = await read(res);
    expect(status).toBe(200);
    expect(body.data.name).toBe("Renamed Agency");
    expect(body.data.status).toBe("disabled");
    expect(body.data.agentCode).toBe("AGT-00001");
    const fetched = await read(await getAgent(new Request(BASE + "/x"), { params: { id: SEED_IDS.agent1 } }));
    expect(fetched.body.data.name).toBe("Renamed Agency");
  });

  it("links a merchant to an agent and rejects unknown agents", async () => {
    const bad = await read(await createMerchant(json("/api/merchants", "POST", { ...validMerchant, agentId: "agt_nope" }), {}));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fieldErrors).toEqual({ agentId: "invalid" });

    const ok = await read(await createMerchant(json("/api/merchants", "POST", { ...validMerchant, agentId: SEED_IDS.agent2 }), {}));
    expect(ok.status).toBe(201);
    expect(ok.body.data.agent).toMatchObject({ id: SEED_IDS.agent2, agentCode: "AGT-00002" });
    expect(ok.body.data.enabledMethods).toEqual([]);
  });
});
