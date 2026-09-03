import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { API_KEY_SELECT, MAX_ROTATION_GRACE_DAYS, ROTATION_GRACE_DAYS, apiKeyUsable, isApiKeyKind, isApiKeyMode, toApiKeyView } from "@/lib/merchants/api-keys";
import { generateApiKey, hashApiKey } from "@/lib/merchants/api-keys-server";
import { encryptSigningSecret } from "@/lib/merchants/secrets";

type Ctx = { params: { id: string; keyId: string } };

const Body = z.object({ graceDays: z.number().int().min(0).max(MAX_ROTATION_GRACE_DAYS).default(ROTATION_GRACE_DAYS) });

/**
 * POST /api/merchants/:id/api-keys/:keyId/rotate — issue a replacement with
 * the same mode / kind / label; the old key keeps working for `graceDays`.
 */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { graceDays } = Body.parse(await readJson(req));
  const old = await prisma.apiKey.findFirst({ where: { id: params.keyId, merchantId: params.id }, select: API_KEY_SELECT });
  if (!old) throw new ApiError(404, "not_found", "errors.notFound");
  if (!apiKeyUsable(old)) throw new ApiError(409, "key_not_active", "errors.apiKeyNotActive");
  const mode = isApiKeyMode(old.mode) ? old.mode : "test";
  const kind = isApiKeyKind(old.kind) ? old.kind : "api_key";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + graceDays * 86_400_000);
  const { plaintext, keyPrefix } = generateApiKey(mode, kind);
  const audit = await auditContextFromRequest(req);
  const created = await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id: old.id }, data: { expiresAt } });
    const row = await tx.apiKey.create({
      data: { merchantId: params.id, mode, kind, label: old.label, keyPrefix, keyHash: hashApiKey(plaintext), secretEnc: kind === "signing_secret" ? encryptSigningSecret(plaintext) : null },
      select: API_KEY_SELECT,
    });
    await recordAudit(tx, audit, {
      action: "api_key.rotate",
      targetType: "api_key",
      targetId: old.id,
      before: { keyPrefix: old.keyPrefix, expiresAt: old.expiresAt },
      after: { keyPrefix: old.keyPrefix, expiresAt, replacement: row.id, replacementPrefix: keyPrefix, graceDays },
    });
    return row;
  });
  const rows = await prisma.apiKey.findMany({ where: { merchantId: params.id }, orderBy: [{ mode: "asc" }, { kind: "asc" }, { issuedAt: "desc" }], select: API_KEY_SELECT });
  return ok({ key: toApiKeyView(created, now), plaintext, keys: rows.map((r) => toApiKeyView(r, now)) }, { status: 201 });
});
