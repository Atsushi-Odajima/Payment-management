import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { currentAdminFromRequest } from "@/lib/admin/current";
import { latestNotifications } from "@/lib/notifications/list";

/** GET /api/notifications/unread — the bell: unread count + the latest 10 (anonymous → empty, no error). */
export const GET = withApiHandler(async (req) => {
  const admin = await currentAdminFromRequest(req);
  if (!admin) return ok({ unread: 0, notifications: [] });
  const { rows, unread } = await latestNotifications(prisma, admin, 10);
  return ok({ unread, notifications: rows });
});
