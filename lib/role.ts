// Operator role (master / general). The role comes from the signed-in
// AdminUser's session — there is no self-service toggle any more. Server code
// derives it here (and only here) and the client receives it through
// SessionProvider (components/session-provider.tsx).

import type { Role } from "@/lib/merchants/types";
import { currentAdminFromRequest } from "@/lib/admin/current";

export type { Role };

/** Role used for anonymous visitors (read-only). */
export const DEFAULT_ROLE: Role = "general";

export async function roleFromRequest(req: Request): Promise<Role> {
  return (await currentAdminFromRequest(req))?.role ?? DEFAULT_ROLE;
}
