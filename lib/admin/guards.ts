// Invariants for editing admin accounts: you cannot lock yourself out, and
// the last active admin (full-permission role) can neither be demoted nor
// disabled. Legacy "master" rows count as admin until the seed migrates them.

import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { normalizeRole } from "@/lib/role";

type Db = PrismaClient | Prisma.TransactionClient;

export async function assertNotLastMaster(
  db: Db,
  target: { id: string; role: string; status: string },
  next: { role: string; status: string },
): Promise<void> {
  const wasActiveAdmin = normalizeRole(target.role) === "admin" && target.status !== "disabled";
  const staysActiveAdmin = normalizeRole(next.role) === "admin" && next.status !== "disabled";
  if (!wasActiveAdmin || staysActiveAdmin) return;
  const others = await db.adminUser.count({ where: { role: { in: ["admin", "master"] }, status: { not: "disabled" }, id: { not: target.id } } });
  if (others === 0) throw new ApiError(400, "last_master", "errors.lastMaster");
}

export function assertNotSelfDemotion(actorId: string, target: { id: string; role: string; status: string }, next: { role: string; status: string }): void {
  if (actorId !== target.id) return;
  if (normalizeRole(next.role) !== normalizeRole(target.role) || next.status === "disabled") {
    throw new ApiError(400, "self_change", "errors.adminSelfChange");
  }
}
