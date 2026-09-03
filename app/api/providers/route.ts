import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/api/role-guard";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { buildCredentialStore } from "@/lib/providers/credentials";
import { getProviderDefinition } from "@/lib/providers/registry";
import { credentialSchemaFor, missingRequiredFields } from "@/lib/providers/validation";
import { langFromRequest, pickText } from "@/lib/i18n";
import { DEMO_LIMITS } from "@/lib/demo";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

const CreateSchema = z.object({
  providerKey: z.string().min(1),
  displayName: z.string().min(1).max(80),
  testMode: z.boolean().default(true),
  credentials: z.record(z.string(), z.string().optional()).default({}),
});

export const POST = withApiHandler(async (req) => {
    await requirePermission(req, "provider", "create");
  const lang = langFromRequest(req);
  const body = CreateSchema.parse(await readJson(req));
  const def = getProviderDefinition(body.providerKey);
  if (!def) throw new ApiError(400, "unsupported_provider", "errors.unsupportedProvider");

  // Field-level validation derived from the registry definition.
  const creds = credentialSchemaFor(def, "create").parse(body.credentials);
  const missing = missingRequiredFields(def, creds);
  if (missing.length > 0) {
    throw new ApiError(400, "missing_required", "errors.missingRequired", {
      fields: missing.map((f) => pickText(f.label, lang)).join(", "),
    });
  }

  const count = await prisma.paymentProvider.count();
  if (count >= DEMO_LIMITS.providers) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.providers });
  }

  const store = buildCredentialStore(def.key, creds);
  const record = await prisma.paymentProvider.create({
    data: {
      providerKey: def.key,
      category: def.category,
      displayName: body.displayName,
      credentials: JSON.stringify(store),
      testMode: body.testMode,
    },
    select: { id: true, providerKey: true, category: true, displayName: true, testMode: true, status: true },
  });
  await recordAudit(prisma, await auditContextFromRequest(req), { action: "provider.create", targetType: "provider", targetId: record.id, after: record });
  return ok({ id: record.id }, { status: 201 });
});

export const GET = withApiHandler(async () => {
  // Never include `credentials` here.
  const providers = await prisma.paymentProvider.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      providerKey: true,
      category: true,
      displayName: true,
      status: true,
      testMode: true,
      createdAt: true,
    },
  });
  return ok({ providers });
});
