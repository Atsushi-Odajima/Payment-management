// Invariants for editing admin accounts: you cannot lock yourself out, and
// the last active master can neither be demoted nor disabled.

import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";

type Db = PrismaClient | Prisma.TransactionClient;

export async function assertNotLastMaster(
  db: Db,
  target: { id: string; role: string; status: string },
  next: { role: string; status: string },
): Promise<void> {
  const wasActiveMaster = target.role === "master" && target.status !== "disabled";
  const staysActiveMaster = next.role === "master" && next.status !== "disabled";
  if (!wasActiveMaster || staysActiveMaster) return;
  const others = await db.adminUser.count({ where: { role: "master", status: { not: "disabled" }, id: { not: target.id } } });
  if (others === 0) throw new ApiError(400, "last_master", "errors.lastMaster");
}

export function assertNotSelfDemotion(actorId: string, target: { id: string; role: string; status: string }, next: { role: string; status: string }): void {
  if (actorId !== target.id) return;
  if (next.role !== target.role || next.status === "disabled") {
    throw new ApiError(400, "self_change", "errors.adminSelfChange");
  }
}
