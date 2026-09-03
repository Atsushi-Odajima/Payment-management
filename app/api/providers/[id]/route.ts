import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { mergeCredentialStore } from "@/lib/providers/credentials";
import { getProviderDefinition } from "@/lib/providers/registry";
import { credentialSchemaFor, missingRequiredFields } from "@/lib/providers/validation";
import { langFromRequest, pickText } from "@/lib/i18n";
import { PROVIDER_STATUSES } from "@/lib/utils";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

const UpdateSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  status: z.enum(PROVIDER_STATUSES).optional(),
  testMode: z.boolean().optional(),
  credentials: z.record(z.string(), z.string().optional()).optional(),
});

type Ctx = { params: { id: string } };

export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  const lang = langFromRequest(req);
  const body = UpdateSchema.parse(await readJson(req));

  const existing = await prisma.paymentProvider.findUnique({
    where: { id: params.id },
    select: {
      providerKey: true,
      credentials: true,
      displayName: true,
      status: true,
      testMode: true,
    },
  });
  if (!existing) throw new ApiError(404, "not_found", "errors.notFound");
  const def = getProviderDefinition(existing.providerKey);
  if (!def) throw new ApiError(400, "unsupported_provider", "errors.unsupportedProvider");

  // Validate the shape of what was sent, then merge (secret "" = keep) and
  // make sure the merged store still has every required field.
  const incoming = credentialSchemaFor(def, "patch").parse(body.credentials ?? {});
  const merged = mergeCredentialStore(def.key, existing.credentials, incoming);
  const missing = missingRequiredFields(def, merged);
  if (missing.length > 0) {
    throw new ApiError(400, "missing_required", "errors.missingRequired", {
      fields: missing.map((f) => pickText(f.label, lang)).join(", "),
    });
  }

  const updated = await prisma.paymentProvider.update({
    where: { id: params.id },
    data: {
      displayName: body.displayName ?? existing.displayName,
      status: body.status ?? existing.status,
      testMode: body.testMode ?? existing.testMode,
      credentials: JSON.stringify(merged),
    },
    select: { id: true, displayName: true, status: true, testMode: true },
  });
  await recordAudit(prisma, await auditContextFromRequest(req), {
    action: "provider.update",
    targetType: "provider",
    targetId: updated.id,
    before: { displayName: existing.displayName, status: existing.status, testMode: existing.testMode },
    after: { displayName: updated.displayName, status: updated.status, testMode: updated.testMode, credentialsChanged: Object.keys(incoming).length > 0 },
  });
  return ok({ id: updated.id });
});

export const DELETE = withApiHandler<Ctx>(async (req, { params }) => {
  const record = await prisma.paymentProvider.findUnique({
    where: { id: params.id },
    select: { id: true, providerKey: true, displayName: true, _count: { select: { payments: true } } },
  });
  if (!record) throw new ApiError(404, "not_found", "errors.notFound");
  if (record._count.payments > 0) {
    // Ledger protection: disable instead of deleting a provider with history.
    throw new ApiError(409, "provider_has_payments", "errors.providerHasPayments", {
      count: record._count.payments,
    });
  }
  const audit = await auditContextFromRequest(req);
  await prisma.$transaction(async (tx) => {
    await tx.paymentProvider.delete({ where: { id: params.id } });
    await recordAudit(tx, audit, { action: "provider.delete", targetType: "provider", targetId: params.id, before: { providerKey: record.providerKey, displayName: record.displayName } });
  });
  return ok({ deleted: true });
});
