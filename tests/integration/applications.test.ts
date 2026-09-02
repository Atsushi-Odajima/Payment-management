import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SEED_IDS, seed, truncateAll } from "@/prisma/seed-data";
import { parseEnabledMethods } from "@/lib/merchants/types";
import { GET as listApplications } from "@/app/api/applications/route";
import { POST as review } from "@/app/api/applications/[id]/review/route";

const BASE = "http://localhost";

function reviewReq(id: string, body: unknown, role?: "master" | "general") {
  return review(
    new Request(`${BASE}/api/applications/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(role ? { cookie: `wirepay.role=${role}` } : {}) },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed(prisma, { now: new Date("2026-09-01T03:00:00Z") });
});

describe("payment applications API", () => {
  it("lists seeded applications with pending ones first", async () => {
    const { body } = await read(await listApplications(new Request(BASE + "/api/applications"), {}));
    const statuses = body.data.applications.map((a: { status: string }) => a.status);
    expect(statuses).toHaveLength(4);
    expect(statuses.slice(0, 2)).toEqual(["pending", "pending"]);
    expect(statuses.slice(2).sort()).toEqual(["approved", "rejected"]);
    expect(body.data.applications[0].merchant.merchantCode).toMatch(/^MER-\d{5}$/);
  });

  it("refuses review for the general role and without a role cookie", async () => {
    const general = await read(await reviewReq(SEED_IDS.application1, { decision: "approve" }, "general"));
    expect(general.status).toBe(403);
    expect(general.body.error.code).toBe("role_required");
    const none = await read(await reviewReq(SEED_IDS.application1, { decision: "approve" }));
    expect(none.status).toBe(403);
    const row = await prisma.paymentApplication.findUniqueOrThrow({ where: { id: SEED_IDS.application1 } });
    expect(row.status).toBe("pending");
  });

  it("requires a reason to reject or return", async () => {
    for (const decision of ["reject", "return"]) {
      const { status, body } = await read(await reviewReq(SEED_IDS.application1, { decision, reason: "  " }, "master"));
      expect(status).toBe(400);
      expect(body.error.code).toBe("reason_required");
    }
  });

  it("approval enables the requested method on the merchant in one step", async () => {
    const app = await prisma.paymentApplication.findUniqueOrThrow({ where: { id: SEED_IDS.application1 } });
    const before = parseEnabledMethods((await prisma.merchant.findUniqueOrThrow({ where: { id: app.merchantId } })).enabledMethods);
    expect(before).not.toContain(app.method);

    const { status, body } = await read(await reviewReq(SEED_IDS.application1, { decision: "approve" }, "master"));
    expect(status).toBe(200);
    expect(body.data.status).toBe("approved");
    expect(body.data.enabledMethods).toContain(app.method);

    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: app.merchantId } });
    expect(parseEnabledMethods(merchant.enabledMethods)).toEqual([...before, app.method]);
    const updated = await prisma.paymentApplication.findUniqueOrThrow({ where: { id: SEED_IDS.application1 } });
    expect(updated.reviewedAt).not.toBeNull();
  });

  it("rejects a second review of the same application with 409", async () => {
    expect((await reviewReq(SEED_IDS.application2, { decision: "return", reason: "Missing documents" }, "master")).status).toBe(200);
    const again = await read(await reviewReq(SEED_IDS.application2, { decision: "approve" }, "master"));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_reviewed");
    const row = await prisma.paymentApplication.findUniqueOrThrow({ where: { id: SEED_IDS.application2 } });
    expect(row.status).toBe("returned");
    expect(row.reviewerNote).toBe("Missing documents");
  });

  it("does not let already-reviewed seed rows be reviewed again", async () => {
    const { status } = await read(await reviewReq(SEED_IDS.application3, { decision: "reject", reason: "x" }, "master"));
    expect(status).toBe(409);
  });

  it("returns 404 for an unknown application", async () => {
    const { status } = await read(await reviewReq("app_nope", { decision: "approve" }, "master"));
    expect(status).toBe(404);
  });
});
