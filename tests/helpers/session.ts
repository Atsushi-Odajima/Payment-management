// Session cookies for route-handler tests. Tokens reference the seeded demo
// admin accounts so requireMaster / requireAdmin can load the user row.

import { SESSION_COOKIE, createSessionToken } from "@/lib/auth";
import { SEED_IDS } from "@/prisma/seed-data";

export async function sessionHeaders(role: "master" | "general"): Promise<Record<string, string>> {
  const id = role === "master" ? SEED_IDS.adminMaster : SEED_IDS.adminGeneral;
  const token = await createSessionToken({ id, role });
  return { cookie: `${SESSION_COOKIE}=${token}` };
}
