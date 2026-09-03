// Server-side authorization. Master-only routes call requireMaster() first;
// routes that only need to know who is acting call requireAdmin(). The client
// mirrors these with useRole().isMaster for UI state only.

import { ApiError } from "@/lib/api/handler";
import { currentAdminFromRequest } from "@/lib/admin/current";
import type { CurrentAdmin } from "@/lib/admin/types";

/** 401 unless a valid session belongs to an active (or invited) admin. */
export async function requireAdmin(req: Request): Promise<CurrentAdmin> {
  const admin = await currentAdminFromRequest(req);
  if (!admin) throw new ApiError(401, "unauthorized", "errors.unauthorized");
  return admin;
}

/** 403 unless the signed-in admin has the master role. */
export async function requireMaster(req: Request): Promise<CurrentAdmin> {
  const admin = await currentAdminFromRequest(req);
  if (!admin || admin.role !== "master") {
    throw new ApiError(403, "role_required", "errors.masterRequired");
  }
  return admin;
}
