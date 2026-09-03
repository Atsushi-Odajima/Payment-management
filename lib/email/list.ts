// Loaders for the email template editor and the email log.

import { prisma } from "@/lib/db";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { EMAIL_TEMPLATE_KEYS, isEmailLogStatus, isEmailTemplateKey, type EmailLang, type EmailLogStatus, type EmailTemplateKey } from "./templates";

export interface EmailTemplateRow {
  id: string;
  key: EmailTemplateKey;
  lang: EmailLang;
  subject: string;
  body: string;
  enabled: boolean;
  updatedAt: Date;
}

export async function loadEmailTemplates(): Promise<EmailTemplateRow[]> {
  const rows = await prisma.emailTemplate.findMany({ orderBy: [{ key: "asc" }, { lang: "asc" }] });
  const order = new Map(EMAIL_TEMPLATE_KEYS.map((k, i) => [k, i]));
  return rows
    .filter((r) => isEmailTemplateKey(r.key))
    .map((r): EmailTemplateRow => ({ id: r.id, key: r.key as EmailTemplateKey, lang: r.lang === "en" ? "en" : "ja", subject: r.subject, body: r.body, enabled: r.enabled, updatedAt: r.updatedAt }))
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0) || a.lang.localeCompare(b.lang));
}

export async function loadEmailTemplate(id: string): Promise<EmailTemplateRow | null> {
  const r = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!r || !isEmailTemplateKey(r.key)) return null;
  return { id: r.id, key: r.key, lang: r.lang === "en" ? "en" : "ja", subject: r.subject, body: r.body, enabled: r.enabled, updatedAt: r.updatedAt };
}

export interface EmailLogFilters {
  template: EmailTemplateKey | "";
  status: EmailLogStatus | "";
  to: string;
  from: string;
  to_: string;
}

export interface EmailLogRow {
  id: string;
  to: string;
  templateKey: string;
  lang: string;
  subject: string;
  status: EmailLogStatus;
  provider: string;
  error: string | null;
  paymentId: string | null;
  merchantId: string | null;
  createdAt: Date;
}

export interface EmailLogDetail extends EmailLogRow {
  body: string;
}

export const EMAIL_LOG_SORT_KEYS = ["createdAt", "templateKey", "status"] as const;

export function parseEmailLogFilters(q: QueryParams | undefined): EmailLogFilters {
  return {
    template: isEmailTemplateKey(q?.template) ? q!.template! : "",
    status: isEmailLogStatus(q?.status) ? q!.status! : "",
    to: (q?.to ?? "").trim().slice(0, 200),
    from: parseDateInTz(q?.from) ? q!.from!.trim() : "",
    to_: parseDateInTz(q?.until) ? q!.until!.trim() : "",
  };
}

export function parseEmailLogSort(q: QueryParams | undefined): SortState {
  return parseSort(q, EMAIL_LOG_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

function whereFor(f: EmailLogFilters) {
  const from = parseDateInTz(f.from);
  const until = parseDateInTz(f.to_);
  return {
    ...(f.template ? { templateKey: f.template } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.to ? { to: { contains: f.to } } : {}),
    ...(from || until ? { createdAt: { ...(from ? { gte: from } : {}), ...(until ? { lt: nextDayInTz(until) } : {}) } } : {}),
  };
}

const ROW_SELECT = { id: true, to: true, templateKey: true, lang: true, subject: true, status: true, provider: true, error: true, paymentId: true, merchantId: true, createdAt: true } as const;
const toRow = (r: { status: string } & Omit<EmailLogRow, "status">): EmailLogRow => ({ ...r, status: isEmailLogStatus(r.status) ? r.status : "demo" });

export async function loadEmailLogs(opts: { filters: EmailLogFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const [rows, total] = await Promise.all([
    prisma.emailLog.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: ROW_SELECT }),
    prisma.emailLog.count({ where }),
  ]);
  return { rows: rows.map(toRow), total };
}

export async function loadEmailLogsForExport(filters: EmailLogFilters, sort: SortState, max: number): Promise<EmailLogRow[]> {
  const rows = await prisma.emailLog.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: ROW_SELECT });
  return rows.map(toRow);
}

export async function loadEmailLog(id: string): Promise<EmailLogDetail | null> {
  const r = await prisma.emailLog.findUnique({ where: { id }, select: { ...ROW_SELECT, body: true } });
  return r ? { ...toRow(r), body: r.body } : null;
}
