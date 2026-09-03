import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { ADMIN_SELECT, toAdminView } from "@/lib/admin/select";

/** GET /api/account — the signed-in operator. */
export const GET = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: ADMIN_SELECT });
  return ok(toAdminView(row));
});
