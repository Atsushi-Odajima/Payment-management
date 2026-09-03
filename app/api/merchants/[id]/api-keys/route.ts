import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { API_KEY_KINDS, API_KEY_MODES, API_KEY_SELECT, toApiKeyView } from "@/lib/merchants/api-keys";
import { generateApiKey, hashApiKey } from "@/lib/merchants/api-keys-server";
import { DEMO_LIMITS } from "@/lib/demo";

type Ctx = { params: { id: string } };

const Body = z.object({
  mode: z.enum(API_KEY_MODES),
  kind: z.enum(API_KEY_KINDS),
  label: z.string().trim().max(60).optional(),
});

/** GET /api/merchants/:id/api-keys — keys with their status (never the secret). */
export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const rows = await prisma.apiKey.findMany({ where: { merchantId: params.id }, orderBy: [{ mode: "asc" }, { kind: "asc" }, { issuedAt: "desc" }], select: API_KEY_SELECT });
  const now = new Date();
  return ok({ keys: rows.map((r) => toApiKeyView(r, now)) });
});

/** POST /api/merchants/:id/api-keys — issue a key; the plaintext is returned exactly once. */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const body = Body.parse(await readJson(req));
  const merchant = await prisma.merchant.findUnique({ where: { id: params.id }, select: { id: true, _count: { select: { apiKeys: true } } } });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  if (merchant._count.apiKeys >= DEMO_LIMITS.apiKeysPerMerchant) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.apiKeysPerMerchant });
  }
  const { plaintext, keyPrefix } = generateApiKey(body.mode, body.kind);
  const audit = await auditContextFromRequest(req);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: { merchantId: params.id, mode: body.mode, kind: body.kind, label: body.label || null, keyPrefix, keyHash: hashApiKey(plaintext) },
      select: API_KEY_SELECT,
    });
    await recordAudit(tx, audit, { action: "api_key.issue", targetType: "api_key", targetId: created.id, after: { merchantId: params.id, mode: body.mode, kind: body.kind, keyPrefix, label: body.label ?? null } });
    return created;
  });
  return ok({ key: toApiKeyView(row), plaintext }, { status: 201 });
});
