import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { markRead, unreadCount } from "@/lib/notifications/list";

/** POST /api/notifications/:id/read — mark one notification read for the signed-in admin. */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const done = await markRead(prisma, admin, params.id);
  if (!done) throw new ApiError(404, "not_found", "errors.notFound");
  return ok({ unread: await unreadCount(prisma, admin) });
});
