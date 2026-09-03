import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { validateAdminCreate } from "@/lib/admin/schema";
import { generateInitialPassword, hashPassword } from "@/lib/admin/password";
import { ADMIN_SELECT, toAdminView } from "@/lib/admin/select";
import { recordAudit, requestIp } from "@/lib/audit";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { isUniqueViolation } from "@/lib/ids";
import { DEMO_LIMITS } from "@/lib/demo";

/** GET /api/admins — list (master). `?format=csv` exports the same rows. */
export const GET = withApiHandler(async (req) => {
  await requireMaster(req);
  const rows = await prisma.adminUser.findMany({ orderBy: { loginId: "asc" }, select: ADMIN_SELECT, take: CSV_MAX_ROWS });
  const admins = rows.map(toAdminView);
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return csvResponse(
      toCsv(admins, [
        { header: "loginId", value: (a) => a.loginId },
        { header: "name", value: (a) => a.name },
        { header: "email", value: (a) => a.email },
        { header: "role", value: (a) => a.role },
        { header: "status", value: (a) => a.status },
        { header: "totpEnabled", value: (a) => a.totpEnabled },
        { header: "lastLoginAt", value: (a) => a.lastLoginAt },
        { header: "createdAt", value: (a) => a.createdAt },
      ]),
      "admins.csv",
    );
  }
  return ok({ admins });
});

/**
 * POST /api/admins — invite an operator (master). The initial password is
 * generated here and returned exactly once; the account starts as "invited"
 * and becomes "active" on first login.
 */
export const POST = withApiHandler(async (req) => {
  const actor = await requireMaster(req);
  const v = validateAdminCreate(await readJson(req));
  if (!v.ok) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  const count = await prisma.adminUser.count();
  if (count >= DEMO_LIMITS.admins) throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.admins });

  const initialPassword = generateInitialPassword();
  const data = { ...v.data, loginId: v.data.loginId.toLowerCase(), email: v.data.email.toLowerCase(), status: "invited" as const };
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.create({ data: { ...data, passwordHash: hashPassword(initialPassword) }, select: ADMIN_SELECT });
      await recordAudit(tx, { actor: { type: "admin", id: actor.id }, ip: requestIp(req) }, { action: "admin.create", targetType: "admin_user", targetId: row.id, after: row });
      return row;
    });
    return ok({ admin: toAdminView(created), initialPassword }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await prisma.adminUser.findFirst({ where: { OR: [{ loginId: data.loginId }, { email: data.email }] }, select: { loginId: true } });
      const field = existing?.loginId === data.loginId ? "loginId" : "email";
      throw new ApiError(409, "conflict", "errors.conflict", undefined, { fieldErrors: { [field]: "taken" } });
    }
    throw err;
  }
});
