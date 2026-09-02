// Server-side role enforcement. Every role-gated API route calls
// requireMaster(); the client mirrors it with useRole().isMaster for UI only.

import { ApiError } from "./handler";
import { roleFromRequest } from "@/lib/role";

export function requireMaster(req: Request): void {
  if (roleFromRequest(req) !== "master") {
    throw new ApiError(403, "role_required", "errors.masterRequired");
  }
}
