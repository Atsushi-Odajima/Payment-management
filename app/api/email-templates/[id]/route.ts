import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { loadEmailTemplate } from "@/lib/email/list";
import { emailTemplateUpdateSchema } from "@/lib/email/templates";

type Ctx = { params: { id: string } };

/** GET /api/email-templates/:id */
export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const row = await loadEmailTemplate(params.id);
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(row);
});

/** PATCH /api/email-templates/:id — subject / body / enabled (master). */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  await requirePermission(req, "email_template", "update");
  const parsed = emailTemplateUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const before = await prisma.emailTemplate.findUnique({ where: { id: params.id }, select: { key: true, lang: true, subject: true, body: true, enabled: true } });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  const audit = await auditContextFromRequest(req);
  await prisma.$transaction(async (tx) => {
    await tx.emailTemplate.update({ where: { id: params.id }, data: parsed.data });
    await recordAudit(tx, audit, { action: "email_template.update", targetType: "email_template", targetId: params.id, before, after: { key: before.key, lang: before.lang, ...parsed.data } });
  });
  return ok(await loadEmailTemplate(params.id));
});
