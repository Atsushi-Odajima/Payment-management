import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadActiveAnnouncements, loadAnnouncements, parseAnnouncementFilters, parseAnnouncementSort, toAnnouncementRow } from "@/lib/announcements/list";
import { createAnnouncement } from "@/lib/announcements/service";
import { announcementInputSchema } from "@/lib/announcements/types";

/** GET /api/announcements — all announcements (admin); `?active=1` only the ones live now. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (q.active === "1") return ok({ announcements: await loadActiveAnnouncements() });
  const page = parsePage(q.page);
  const { rows, total } = await loadAnnouncements({ filters: parseAnnouncementFilters(q), sort: parseAnnouncementSort(q), page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ announcements: rows, total, page, pageSize: DEFAULT_PAGE_SIZE });
});

/** POST /api/announcements — create a draft, or publish right away with `{ publish: true }`. */
export const POST = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const raw = (await readJson(req)) as Record<string, unknown>;
  const parsed = announcementInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const row = await createAnnouncement(prisma, { input: parsed.data, publish: raw.publish === true, actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok(toAnnouncementRow(row), { status: 201 });
});
