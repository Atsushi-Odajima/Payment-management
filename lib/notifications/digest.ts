// Daily digests and deadline reminders (Phase J), run by the hourly
// notifications cron. Each digest keys its dedupe target on the business
// day, so the hourly cron produces at most one notification per day.

import type { PrismaClient } from "@prisma/client";
import { startOfDayInTz } from "@/lib/time";
import { partsInTz, ymd } from "@/lib/settlements/schedule";
import { emitNotification } from "./emit";

export const CHARGEBACK_REMINDER_DAYS = 3;

export async function runDailyDigests(db: PrismaClient, now: Date = new Date()): Promise<{ transferOverdue: number; cvsOverdue: number; chargebackReminders: number }> {
  const day = ymd(partsInTz(now));
  const todayStart = startOfDayInTz(now);

  // Bank transfers past their deadline and still awaiting (the expiry cron turns them into expired an hour later at most).
  const transferOverdue = await db.payment.count({ where: { method: "bank", status: "awaiting_transfer", transferDueAt: { lt: now } } });
  if (transferOverdue > 0) {
    await emitNotification(db, {
      kind: "transfer.overdue",
      title: `Overdue bank transfers: ${transferOverdue}`,
      body: `${transferOverdue} bank transfer(s) passed their deadline and are still awaiting a deposit (${day}).`,
      href: "/applications?status=awaiting_transfer",
      roles: ["admin", "accounting", "cs"],
      targetType: "digest",
      targetId: `transfer.overdue:${day}`,
      now,
    });
  }

  // Konbini payments (Phase K adds the status; until then the count is zero).
  const cvsOverdue = await db.payment.count({ where: { method: "convenience", status: "pending", transferDueAt: { lt: now } } });
  if (cvsOverdue > 0) {
    await emitNotification(db, {
      kind: "cvs.overdue",
      title: `Overdue konbini payments: ${cvsOverdue}`,
      body: `${cvsOverdue} konbini payment(s) passed their deadline (${day}).`,
      href: "/applications?status=pending",
      roles: ["admin", "accounting", "cs"],
      targetType: "digest",
      targetId: `cvs.overdue:${day}`,
      now,
    });
  }

  // Chargeback disputes whose deadline is within three days (per case; deduped for 24 h by the emitter).
  const soon = new Date(todayStart.getTime() + (CHARGEBACK_REMINDER_DAYS + 1) * 86_400_000);
  const chargebacks = await db.chargeback.findMany({
    where: { status: { in: ["received", "disputed"] }, disputeDeadlineAt: { gte: now, lt: soon } },
    select: { id: true, disputeDeadlineAt: true, amount: true, payment: { select: { orderNumber: true } } },
  });
  let chargebackReminders = 0;
  for (const c of chargebacks) {
    const id = await emitNotification(db, {
      kind: "chargeback.deadline",
      title: `Chargeback dispute deadline: ${c.payment.orderNumber}`,
      body: `The dispute deadline for ${c.payment.orderNumber} (¥${c.amount.toLocaleString("en-US")}) is ${ymd(partsInTz(c.disputeDeadlineAt!))}.`,
      href: `/chargebacks/${c.id}`,
      roles: ["admin", "accounting"],
      targetType: "chargeback",
      targetId: c.id,
      now,
    });
    if (id) chargebackReminders++;
  }
  return { transferOverdue, cvsOverdue, chargebackReminders };
}
