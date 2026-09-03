// Server-side authorization (Phase I-1). Every mutating route calls
// requirePermission(req, resource, action); the allowed roles come from the
// matrix in lib/role.ts. The client mirrors the same matrix with useCan()
// for UI state only — the server check is the one that counts.

import { ApiError } from "@/lib/api/handler";
import { currentAdminFromRequest } from "@/lib/admin/current";
import type { CurrentAdmin } from "@/lib/admin/types";
import { can, type ActionOf, type Resource } from "@/lib/role";

/** 401 unless a valid session belongs to an active (or invited) admin. */
export async function requireAdmin(req: Request): Promise<CurrentAdmin> {
  const admin = await currentAdminFromRequest(req);
  if (!admin) throw new ApiError(401, "unauthorized", "errors.unauthorized");
  return admin;
}

/** 401 without a session, 403 (`permission_required`) when the role may not perform the action. */
export async function requirePermission<R extends Resource>(req: Request, resource: R, action: ActionOf<R>): Promise<CurrentAdmin> {
  const admin = await currentAdminFromRequest(req);
  if (!admin) throw new ApiError(401, "unauthorized", "errors.unauthorized");
  if (!can(admin.role, resource, action)) throw new ApiError(403, "permission_required", "errors.permissionRequired");
  return admin;
}

/** Admin-only shortcut kept for the account-management routes. */
export async function requireMaster(req: Request): Promise<CurrentAdmin> {
  return requirePermission(req, "admin_user", "update");
}
