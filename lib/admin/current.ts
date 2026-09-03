// Resolves the signed-in operator for Server Components and Route Handlers.
// The cookie only proves "who and which role at login time"; the user row is
// re-read so a disabled account (or a changed role) takes effect immediately.

import { prisma } from "@/lib/db";
import { SESSION_COOKIE, cookieFromHeader, verifySessionToken } from "@/lib/auth";
import { isAdminStatus, type CurrentAdmin } from "./types";

const CURRENT_SELECT = {
  id: true,
  loginId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  totpEnabled: true,
} as const;

export async function currentAdminFromToken(token: string | null | undefined): Promise<CurrentAdmin | null> {
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const row = await prisma.adminUser.findUnique({ where: { id: payload.sub }, select: CURRENT_SELECT });
  if (!row || row.status === "disabled") return null;
  return {
    id: row.id,
    loginId: row.loginId,
    name: row.name,
    email: row.email,
    role: row.role === "master" ? "master" : "general",
    status: isAdminStatus(row.status) ? row.status : "active",
    totpEnabled: row.totpEnabled,
  };
}

/** Route Handlers: read the session cookie from the request. */
export async function currentAdminFromRequest(req: Request): Promise<CurrentAdmin | null> {
  return currentAdminFromToken(cookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE));
}
