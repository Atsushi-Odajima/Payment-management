// Announcements (Phase G-3): notices, maintenance windows and incidents
// shown to merchants (banner + list) with an update timeline for incidents.

import { z } from "zod";

export const ANNOUNCEMENT_KINDS = ["notice", "maintenance", "incident"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const ANNOUNCEMENT_STATUSES = ["draft", "published", "ended"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const INCIDENT_PHASES = ["occurred", "investigating", "resolved"] as const;
export type IncidentPhase = (typeof INCIDENT_PHASES)[number];

const includes = (list: readonly string[], v: unknown): boolean => typeof v === "string" && list.includes(v);
export const isAnnouncementKind = (v: unknown): v is AnnouncementKind => includes(ANNOUNCEMENT_KINDS, v);
export const isAnnouncementStatus = (v: unknown): v is AnnouncementStatus => includes(ANNOUNCEMENT_STATUSES, v);
export const isIncidentPhase = (v: unknown): v is IncidentPhase => includes(INCIDENT_PHASES, v);

const dateTime = z
  .string()
  .trim()
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "date");

export const announcementInputSchema = z.object({
  kind: z.enum(ANNOUNCEMENT_KINDS),
  title: z.string().trim().min(1, "required").max(120, "tooLong"),
  body: z.string().trim().min(1, "required").max(5000, "tooLong"),
  /** ISO date-time (datetime-local); empty = now. */
  publishFrom: dateTime.default(""),
  publishUntil: dateTime.default(""),
  targetAll: z.boolean().default(true),
  targetMerchantIds: z.array(z.string().min(1).max(64)).max(200).default([]),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const announcementUpdateSchema = z.object({
  phase: z.enum(INCIDENT_PHASES),
  body: z.string().trim().min(1, "required").max(2000, "tooLong"),
});

export function parseTargetIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
