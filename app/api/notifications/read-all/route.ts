import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { markAllRead } from "@/lib/notifications/list";

/** POST /api/notifications/read-all — mark every visible notification read for the signed-in admin. */
export const POST = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  return ok({ marked: await markAllRead(prisma, admin), unread: 0 });
});
