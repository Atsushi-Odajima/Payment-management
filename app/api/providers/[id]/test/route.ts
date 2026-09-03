import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/api/role-guard";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { readCredentialsForUse } from "@/lib/providers/credentials";
import { runConnectionTest } from "@/lib/providers/connection";
import { langFromRequest } from "@/lib/i18n";

/** Connection test against the stored (decrypted) credentials; records the result. */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
    await requirePermission(req, "provider", "test");
  const lang = langFromRequest(req);
  const record = await prisma.paymentProvider.findUnique({
    where: { id: params.id },
    select: { id: true, providerKey: true, credentials: true, testMode: true },
  });
  if (!record) throw new ApiError(404, "provider_not_found", "errors.providerNotFound");

  // DecryptionError (key changed) propagates → 422 "undecryptable" via withApiHandler.
  const creds = readCredentialsForUse(record.providerKey, record.credentials);
  const result = runConnectionTest(record.providerKey, creds, record.testMode, lang);
  await prisma.paymentProvider.update({
    where: { id: record.id },
    data: { lastTestAt: new Date(), lastTestOk: result.ok },
  });
  return ok(result);
});
