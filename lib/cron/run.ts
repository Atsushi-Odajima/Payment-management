// Cron job wrapper (Phase J): a failing batch raises a critical notification
// (batch.failed, deduped per job for 24 h) and is re-thrown so the route
// still answers 500 and Vercel records the failed invocation.

import { prisma } from "@/lib/db";
import { emitNotification } from "@/lib/notifications/emit";

export async function runCron<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron] ${name} failed`, e);
    await emitNotification(prisma, {
      kind: "batch.failed",
      title: `Batch failed: ${name}`,
      body: message.slice(0, 500),
      href: "/audit-logs",
      roles: ["admin", "developer"],
      targetType: "cron",
      targetId: name,
    });
    throw e;
  }
}
