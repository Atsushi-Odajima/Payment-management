// Issues the session cookie after a successful login (password step, or the
// TOTP step for accounts with two-factor enabled) and records the audit row.

import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/handler";
import { SESSION_COOKIE, SESSION_TTL_SEC, TWO_FACTOR_COOKIE, createSessionToken, sessionCookieAttributes } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { toAdminView } from "./select";
import type { Role } from "./types";
import { normalizeRole } from "@/lib/role";

export async function issueSession(user: { id: string; role: string; status: string }, ip: string | null) {
  const role: Role = normalizeRole(user.role);
  const token = await createSessionToken({ id: user.id, role });
  const updated = await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(user.status === "invited" ? { status: "active" } : {}) },
    select: { id: true, loginId: true, name: true, email: true, role: true, status: true, totpEnabled: true, lastLoginAt: true, createdAt: true, updatedAt: true },
  });
  await recordAudit(prisma, { actor: { type: "admin", id: user.id }, ip }, { action: "auth.login", targetType: "session", targetId: user.id });
  const res = ok({ authenticated: true, user: toAdminView(updated) });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes(SESSION_TTL_SEC)}`);
  res.headers.append("set-cookie", `${TWO_FACTOR_COOKIE}=; ${sessionCookieAttributes(0)}`);
  return res;
}
