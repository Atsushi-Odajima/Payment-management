// Notification fan-out (Phase J): pending rows → e-mail (through the
// templated e-mail log) and Slack (Incoming Webhook, one retry, SlackLog).
// In-app delivery needs nothing: the row itself is what the bell shows.

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendTemplatedEmail } from "@/lib/email/send";
import type { EmailLang } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/webhooks/deliver";
import { loadGlobalSettings } from "@/lib/settings/global";
import { normalizeRole, type Role } from "@/lib/role";
import { SEVERITY_EMOJI, isNotificationKind, isNotificationSeverity, type NotificationKind } from "./types";

export const SLACK_TIMEOUT_MS = 8_000;
export const SLACK_MAX_ATTEMPTS = 2;

function operatorLang(): EmailLang {
  return process.env.EMAIL_DEFAULT_LANG === "en" ? "en" : "ja";
}

/** Slack is only posted when the app can reach the network: tests and the queue mode leave a "demo" log entry. */
export function slackDeferred(): boolean {
  return process.env.NODE_ENV === "test" || process.env.WEBHOOK_DELIVERY === "queue";
}

export interface SlackSendResult {
  status: "sent" | "failed" | "demo" | "skipped";
  attempts: number;
  responseStatus: number | null;
  error: string | null;
}

/** POST a message to the configured Incoming Webhook URL; retries once on a failure. Records a SlackLog row. */
export async function sendSlack(db: PrismaClient, opts: { text: string; notificationId?: string | null; url?: string | null; force?: boolean; now?: Date }): Promise<SlackSendResult> {
  const url = opts.url ?? (await loadGlobalSettings(db)).slackWebhookUrl;
  if (!url) return { status: "skipped", attempts: 0, responseStatus: null, error: "no_url" };
  let attempts = 0;
  let responseStatus: number | null = null;
  let error: string | null = null;
  let status: "sent" | "failed" | "demo" = "failed";
  if (slackDeferred() && !opts.force) {
    status = "demo";
    attempts = 1;
  } else {
    while (attempts < SLACK_MAX_ATTEMPTS) {
      attempts++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: opts.text }), signal: controller.signal });
        responseStatus = res.status;
        if (res.ok) {
          status = "sent";
          error = null;
          break;
        }
        error = `http_${res.status}`;
      } catch (e) {
        error = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : String(e);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  await db.slackLog.create({ data: { notificationId: opts.notificationId ?? null, status, attempts, responseStatus, error, text: opts.text.slice(0, 2000), createdAt: opts.now ?? new Date() } });
  return { status, attempts, responseStatus, error };
}

/** Admins who should see the notification: active accounts whose role is in the notification's role list (empty = everyone). */
export async function recipientsFor(db: PrismaClient, roles: readonly Role[]): Promise<Array<{ id: string; email: string; role: Role }>> {
  const rows = await db.adminUser.findMany({ where: { status: { not: "disabled" } }, select: { id: true, email: true, role: true } });
  return rows.map((r) => ({ ...r, role: normalizeRole(r.role) })).filter((r) => roles.length === 0 || roles.includes(r.role));
}

/** Fan out one notification according to the recipients' preferences. */
async function dispatchOne(db: PrismaClient, n: { id: string; kind: string; severity: string; title: string; body: string; href: string | null; roles: string }): Promise<{ emails: number; slack: boolean }> {
  const roles = (JSON.parse(n.roles || "[]") as string[]).map(normalizeRole);
  const recipients = await recipientsFor(db, roles);
  const kind = isNotificationKind(n.kind) ? n.kind : null;
  const prefs = kind ? await db.notificationPreference.findMany({ where: { kind, adminUserId: { in: recipients.map((r) => r.id) } } }) : [];
  const link = n.href ? `${appBaseUrl()}${n.href}` : "";
  let emails = 0;
  for (const p of prefs.filter((p) => p.email)) {
    const to = recipients.find((r) => r.id === p.adminUserId)?.email;
    if (!to) continue;
    const r = await sendTemplatedEmail(db, { key: "notification", lang: operatorLang(), to, vars: { title: n.title, body: n.body, link } });
    if (r.status !== "skipped") emails++;
  }
  let slack = false;
  if (prefs.some((p) => p.slack)) {
    const emoji = SEVERITY_EMOJI[isNotificationSeverity(n.severity) ? n.severity : "info"];
    const r = await sendSlack(db, { notificationId: n.id, text: `${emoji} *${n.title}*\n${n.body}${link ? `\n${link}` : ""}` });
    slack = r.status !== "skipped";
  }
  return { emails, slack };
}

/** Dispatch every notification that has not been fanned out yet (called after emit and by the hourly cron). */
export async function dispatchPendingNotifications(db: PrismaClient = prisma, limit = 50): Promise<{ dispatched: number; emails: number; slack: number }> {
  const pending = await db.notification.findMany({ where: { dispatchedAt: null }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true, kind: true, severity: true, title: true, body: true, href: true, roles: true } });
  let emails = 0;
  let slack = 0;
  for (const n of pending) {
    // Claim first so a concurrent run does not double-send.
    const claimed = await db.notification.updateMany({ where: { id: n.id, dispatchedAt: null }, data: { dispatchedAt: new Date() } });
    if (claimed.count === 0) continue;
    try {
      const r = await dispatchOne(db, n);
      emails += r.emails;
      if (r.slack) slack++;
    } catch (e) {
      console.error("[notifications] fan-out failed", n.id, e);
    }
  }
  return { dispatched: pending.length, emails, slack };
}

export type { NotificationKind };
