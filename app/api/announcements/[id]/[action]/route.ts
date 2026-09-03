import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadAnnouncement } from "@/lib/announcements/list";
import { addAnnouncementUpdate, setAnnouncementStatus } from "@/lib/announcements/service";
import { announcementUpdateSchema } from "@/lib/announcements/types";

/** POST /api/announcements/:id/publish | end | update ({ phase, body }). */
export const POST = withApiHandler<{ params: { id: string; action: string } }>(async (req, { params }) => {
  await requireAdmin(req);
  const audit = await auditContextFromRequest(req);
  if (params.action === "publish" || params.action === "end") {
    await setAnnouncementStatus(prisma, { id: params.id, action: params.action, audit });
  } else if (params.action === "update") {
    const parsed = announcementUpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { body: "required" } });
    await addAnnouncementUpdate(prisma, { id: params.id, phase: parsed.data.phase, body: parsed.data.body, audit });
  } else {
    throw new ApiError(404, "invalid_action", "errors.invalidAction");
  }
  return ok(await loadAnnouncement(params.id));
});
