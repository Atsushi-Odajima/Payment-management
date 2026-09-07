import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emitNotification } from "@/lib/notifications/emit";
import { requirePermission } from "@/lib/api/role-guard";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateMerchantInput } from "@/lib/merchants/schema";
import { nextMerchantCode } from "@/lib/merchants/ids";
import { encryptMerchantPassword, encryptSigningSecret, generateMerchantPassword } from "@/lib/merchants/secrets";
import { generateApiKey, hashApiKey } from "@/lib/merchants/api-keys-server";
import { API_KEY_SELECT, toApiKeyView } from "@/lib/merchants/api-keys";
import { DEMO_LIMITS } from "@/lib/demo";
import { MERCHANT_SELECT, serialize, toMerchantData } from "./select";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

export const GET = withApiHandler(async () => {
  const merchants = await prisma.merchant.findMany({
    orderBy: { merchantCode: "asc" },
    select: MERCHANT_SELECT,
  });
  return ok({ merchants: merchants.map(serialize) });
});

/**
 * POST /api/merchants — issue a merchant account.
 * merchantCode is auto-numbered and the password auto-generated; neither is
 * accepted from the client. The password is stored encrypted and only
 * revealed through GET /api/merchants/:id/password (master role).
 *
 * A test-mode signing secret is issued in the same transaction (Phase P1-4:
 * webhooks are never signed with the password any more) and its plaintext is
 * returned exactly once as `signingSecret`; the live secret is issued by the
 * operator from the API keys tab.
 */
export const POST = withApiHandler(async (req) => {
    await requirePermission(req, "merchant", "create");
  const v = validateMerchantInput(await readJson(req));
  if (!v.ok) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  }
  if (v.data.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: v.data.agentId }, select: { id: true } });
    if (!agent) {
      throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { agentId: "invalid" } });
    }
  }
  const count = await prisma.merchant.count();
  if (count >= DEMO_LIMITS.merchants) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.merchants });
  }

  const passwordEnc = encryptMerchantPassword(generateMerchantPassword());
  const audit = await auditContextFromRequest(req);
  const signing = generateApiKey("test", "signing_secret");

  // Two attempts: a concurrent insert can take the same code; the unique
  // constraint rejects the loser and we recompute once.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const merchantCode = await nextMerchantCode(tx);
        const row = await tx.merchant.create({
          data: { ...toMerchantData(v.data), merchantCode, passwordEnc },
          select: MERCHANT_SELECT,
        });
        await recordAudit(tx, audit, { action: "merchant.create", targetType: "merchant", targetId: row.id, after: row });
        const key = await tx.apiKey.create({
          data: { merchantId: row.id, mode: "test", kind: "signing_secret", label: "auto", keyPrefix: signing.keyPrefix, keyHash: hashApiKey(signing.plaintext), secretEnc: encryptSigningSecret(signing.plaintext) },
          select: API_KEY_SELECT,
        });
        await recordAudit(tx, audit, { action: "api_key.issue", targetType: "api_key", targetId: key.id, after: { merchantId: row.id, mode: "test", kind: "signing_secret", keyPrefix: signing.keyPrefix, label: "auto", issuedWithMerchant: true } });
        await emitNotification(tx, { kind: "merchant.created", title: `New merchant: ${merchantCode} ${row.siteName}`, body: `${row.companyName} was registered.`, href: `/merchants/${row.id}`, roles: ["admin", "accounting", "cs"], targetType: "merchant", targetId: row.id });
        return { row, key };
      });
      return ok({ ...serialize(created.row), signingSecret: { plaintext: signing.plaintext, key: toApiKeyView(created.key) } }, { status: 201 });
    } catch (err) {
      if (
        attempt === 0 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new ApiError(409, "conflict", "errors.conflict");
});
