// Fraud checks (Phase F-2): card fingerprinting, blacklist matching at
// checkout, and repeated-failure detection that files blacklist candidates.

import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { recordAudit, systemAuditContext, type AuditContext } from "@/lib/audit";
import { BLOCKED_FAILURE_PREFIX, DEFAULT_RISK_SETTINGS, RISK_SETTINGS_ID, normalizeBlacklistValue, type BlacklistKind, type CardInput, type RiskSettingsInput } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

/** Pseudo card fingerprint: sha256(brand|last4|expiry). Demo only — never a PAN. */
export function cardFingerprint(card: CardInput): string {
  return createHash("sha256").update(`${card.brand}|${card.last4}|${card.expiry}`).digest("hex");
}

export async function loadRiskSettings(db: Db): Promise<RiskSettingsInput> {
  const row = await db.riskSetting.findUnique({ where: { id: RISK_SETTINGS_ID }, select: { windowMinutes: true, maxFailures: true } });
  return row ?? DEFAULT_RISK_SETTINGS;
}

export async function saveRiskSettings(db: PrismaClient, input: RiskSettingsInput, audit: AuditContext): Promise<RiskSettingsInput> {
  const before = await loadRiskSettings(db);
  return db.$transaction(async (tx) => {
    const row = await tx.riskSetting.upsert({ where: { id: RISK_SETTINGS_ID }, update: input, create: { id: RISK_SETTINGS_ID, ...input }, select: { windowMinutes: true, maxFailures: true } });
    await recordAudit(tx, audit, { action: "risk.settings_update", targetType: "risk_setting", targetId: RISK_SETTINGS_ID, before, after: row });
    return row;
  });
}

export interface RiskKeys {
  cardHash?: string | null;
  clientIp?: string | null;
  email?: string | null;
}

function keyList(keys: RiskKeys): Array<{ kind: BlacklistKind; value: string }> {
  const out: Array<{ kind: BlacklistKind; value: string }> = [];
  if (keys.cardHash) out.push({ kind: "card", value: keys.cardHash });
  if (keys.clientIp) out.push({ kind: "ip", value: keys.clientIp });
  if (keys.email) out.push({ kind: "email", value: normalizeBlacklistValue("email", keys.email) });
  return out;
}

/** First active blacklist entry matching the checkout, or null. */
export async function checkBlacklist(db: Db, keys: RiskKeys): Promise<{ kind: BlacklistKind; id: string } | null> {
  const list = keyList(keys);
  if (list.length === 0) return null;
  const hit = await db.blacklist.findFirst({ where: { status: "active", OR: list.map((k) => ({ kind: k.kind, value: k.value })) }, select: { id: true, kind: true } });
  return hit ? { kind: hit.kind as BlacklistKind, id: hit.id } : null;
}

export function blockedFailureReason(kind: BlacklistKind): string {
  return `${BLOCKED_FAILURE_PREFIX}${kind}`;
}

/**
 * After a failed transaction: count failures sharing the same card / IP /
 * email within the window; at or above the threshold, file a candidate
 * (unless an entry for that value already exists). Returns the candidates created.
 */
export async function detectRepeatedFailures(db: PrismaClient, keys: RiskKeys, now: Date = new Date()): Promise<Array<{ kind: BlacklistKind; value: string }>> {
  const settings = await loadRiskSettings(db);
  const since = new Date(now.getTime() - settings.windowMinutes * 60_000);
  const created: Array<{ kind: BlacklistKind; value: string }> = [];
  for (const k of keyList(keys)) {
    const where = k.kind === "card" ? { cardHash: k.value } : k.kind === "ip" ? { clientIp: k.value } : { customerEmail: k.value };
    const failures = await db.payment.count({ where: { ...where, status: "failed", createdAt: { gte: since } } });
    if (failures < settings.maxFailures) continue;
    const existing = await db.blacklist.findUnique({ where: { kind_value: { kind: k.kind, value: k.value } }, select: { id: true } });
    if (existing) continue;
    await db.$transaction(async (tx) => {
      const row = await tx.blacklist.create({
        data: { kind: k.kind, value: k.value, source: "auto", status: "candidate", reason: `auto: ${failures} failures in ${settings.windowMinutes} min` },
        select: { id: true },
      });
      await recordAudit(tx, systemAuditContext("system"), { action: "blacklist.create", targetType: "blacklist", targetId: row.id, after: { kind: k.kind, value: k.value, source: "auto", status: "candidate", failures } });
    });
    created.push(k);
  }
  return created;
}
