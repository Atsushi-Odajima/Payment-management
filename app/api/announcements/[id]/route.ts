import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadAnnouncement } from "@/lib/announcements/list";
import { updateAnnouncement } from "@/lib/announcements/service";
import { announcementInputSchema } from "@/lib/announcements/types";

type Ctx = { params: { id: string } };

/** GET /api/announcements/:id */
export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const row = await loadAnnouncement(params.id);
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(row);
});

/** PATCH /api/announcements/:id — edit contents / window / audience. */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  await requirePermission(req, "announcement", "update");
  const parsed = announcementInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  await updateAnnouncement(prisma, { id: params.id, input: parsed.data, audit: await auditContextFromRequest(req) });
  return ok(await loadAnnouncement(params.id));
});
