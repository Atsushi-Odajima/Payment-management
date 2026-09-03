import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { merchantAuditContext, recordAudit, requestIp } from "@/lib/audit";
import { requireMerchant } from "@/lib/merchant-portal/session";
import { API_KEY_SELECT, ROTATION_GRACE_DAYS, apiKeyUsable, isApiKeyKind, toApiKeyView } from "@/lib/merchants/api-keys";
import { generateApiKey, hashApiKey } from "@/lib/merchants/api-keys-server";
import { encryptSigningSecret } from "@/lib/merchants/secrets";

/**
 * POST /api/merchant-portal/api-keys/:keyId/rotate — self-service rotation of
 * a **test** key (Phase L-2); live keys are rotated by the PSP. The old key
 * keeps working for the default grace period; the new plaintext is returned once.
 */
export const POST = withApiHandler<{ params: { keyId: string } }>(
  async (req, { params }) => {
    const merchant = await requireMerchant(prisma, req);
    const old = await prisma.apiKey.findFirst({ where: { id: params.keyId, merchantId: merchant.id }, select: API_KEY_SELECT });
    if (!old) throw new ApiError(404, "not_found", "errors.notFound");
    if (old.mode !== "test") throw new ApiError(403, "live_key_rotation", "errors.liveKeyRotation");
    if (!apiKeyUsable(old)) throw new ApiError(409, "key_not_active", "errors.apiKeyNotActive");
    const kind = isApiKeyKind(old.kind) ? old.kind : "api_key";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ROTATION_GRACE_DAYS * 86_400_000);
    const { plaintext, keyPrefix } = generateApiKey("test", kind);
    const created = await prisma.$transaction(async (tx) => {
      await tx.apiKey.update({ where: { id: old.id }, data: { expiresAt } });
      const row = await tx.apiKey.create({
        data: { merchantId: merchant.id, mode: "test", kind, label: old.label, keyPrefix, keyHash: hashApiKey(plaintext), secretEnc: kind === "signing_secret" ? encryptSigningSecret(plaintext) : null },
        select: API_KEY_SELECT,
      });
      await recordAudit(tx, merchantAuditContext(merchant.id, requestIp(req)), {
        action: "api_key.rotate",
        targetType: "api_key",
        targetId: old.id,
        before: { keyPrefix: old.keyPrefix, expiresAt: old.expiresAt },
        after: { keyPrefix: old.keyPrefix, expiresAt, replacement: row.id, replacementPrefix: keyPrefix, graceDays: ROTATION_GRACE_DAYS, self: true },
      });
      return row;
    });
    return ok({ key: toApiKeyView(created, now), plaintext }, { status: 201 });
  },
  { ipRestricted: false },
);
