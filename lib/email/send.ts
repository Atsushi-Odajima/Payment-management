// Single email send function (Phase G-2). Renders the (key, lang) template,
// hands the message to the provider chosen by EMAIL_PROVIDER and records an
// EmailLog row either way. The demo provider "log" never sends: it stores the
// message with status "demo". Adding a real provider means implementing
// EmailProvider and registering it in PROVIDERS — callers do not change.

import type { Prisma, PrismaClient } from "@prisma/client";
import { EMAIL_TEMPLATE_KEYS, isEmailTemplateKey, renderTemplate, type EmailLang, type EmailLogStatus, type EmailTemplateKey, type EmailVars } from "./templates";

type Db = PrismaClient | Prisma.TransactionClient;

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
}

export interface EmailProvider {
  name: string;
  /** Returns the resulting log status; throws on transport errors. */
  send(mail: OutgoingEmail): Promise<EmailLogStatus>;
}

/** Demo provider: nothing leaves the server, the log is the record. */
const logProvider: EmailProvider = {
  name: "log",
  async send() {
    return "demo";
  },
};

/** Console provider for local development: prints and reports "sent". */
const consoleProvider: EmailProvider = {
  name: "console",
  async send(mail) {
    console.log(`[email] to=${mail.to} subject=${mail.subject}\n${mail.body}`);
    return "sent";
  },
};

const PROVIDERS: Record<string, EmailProvider> = { log: logProvider, console: consoleProvider };

export function resolveEmailProvider(): EmailProvider {
  const name = process.env.EMAIL_PROVIDER ?? "log";
  return PROVIDERS[name] ?? logProvider;
}

export interface SendTemplatedInput {
  key: EmailTemplateKey;
  lang: EmailLang;
  to: string;
  vars: EmailVars;
  paymentId?: string | null;
  merchantId?: string | null;
}

export interface SendResult {
  id: string | null;
  status: EmailLogStatus | "skipped";
}

/**
 * Render + send + log. Returns { status: "skipped" } when the template is
 * disabled or missing so callers can fire-and-forget. Never throws.
 */
export async function sendTemplatedEmail(db: Db, input: SendTemplatedInput): Promise<SendResult> {
  if (!isEmailTemplateKey(input.key) || !input.to) return { id: null, status: "skipped" };
  const template = await db.emailTemplate.findUnique({ where: { key_lang: { key: input.key, lang: input.lang } }, select: { subject: true, body: true, enabled: true } });
  if (!template || !template.enabled) return { id: null, status: "skipped" };
  const mail: OutgoingEmail = { to: input.to, subject: renderTemplate(template.subject, input.vars), body: renderTemplate(template.body, input.vars) };
  const provider = resolveEmailProvider();
  let status: EmailLogStatus = "failed";
  let error: string | null = null;
  try {
    status = await provider.send(mail);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const row = await db.emailLog.create({
    data: { to: mail.to, templateKey: input.key, lang: input.lang, subject: mail.subject, body: mail.body, status, provider: provider.name, error, paymentId: input.paymentId ?? null, merchantId: input.merchantId ?? null },
    select: { id: true },
  });
  return { id: row.id, status };
}

/** Default language of customer-facing emails (the demo targets Japanese EC stores). */
export const CUSTOMER_EMAIL_LANG: EmailLang = (process.env.EMAIL_DEFAULT_LANG === "en" ? "en" : "ja") as EmailLang;

export { EMAIL_TEMPLATE_KEYS };
