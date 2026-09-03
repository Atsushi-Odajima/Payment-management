import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { API_KEY_SELECT, toApiKeyView } from "@/lib/merchants/api-keys";

type Ctx = { params: { id: string; keyId: string } };

/** POST /api/merchants/:id/api-keys/:keyId/revoke — stop the key immediately. */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  await requirePermission(req, "api_key", "revoke");
  const row = await prisma.apiKey.findFirst({ where: { id: params.keyId, merchantId: params.id }, select: API_KEY_SELECT });
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  if (row.revokedAt) throw new ApiError(409, "key_not_active", "errors.apiKeyNotActive");
  const now = new Date();
  const audit = await auditContextFromRequest(req);
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.apiKey.update({ where: { id: row.id }, data: { revokedAt: now }, select: API_KEY_SELECT });
    await recordAudit(tx, audit, { action: "api_key.revoke", targetType: "api_key", targetId: row.id, before: { keyPrefix: row.keyPrefix, revokedAt: null }, after: { keyPrefix: row.keyPrefix, revokedAt: now } });
    return r;
  });
  return ok({ key: toApiKeyView(updated, now) });
});
