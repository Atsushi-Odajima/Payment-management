// Session cookies for route-handler tests. Tokens reference the seeded demo
// admin accounts (one per role) so requirePermission can load the user row.
// The legacy names "master" / "general" still resolve (admin / cs).

import { SESSION_COOKIE, createSessionToken } from "@/lib/auth";
import { normalizeRole, type Role } from "@/lib/role";
import { DEMO_ADMIN_ACCOUNTS } from "@/prisma/seed-accounts";

export type TestRole = Role | "master" | "general";

export async function sessionHeaders(role: TestRole): Promise<Record<string, string>> {
  const r = normalizeRole(role);
  const account = Object.values(DEMO_ADMIN_ACCOUNTS).find((a) => a.role === r);
  if (!account) throw new Error(`no demo account for role ${r}`);
  const token = await createSessionToken({ id: account.id, role: r });
  return { cookie: `${SESSION_COOKIE}=${token}` };
}
