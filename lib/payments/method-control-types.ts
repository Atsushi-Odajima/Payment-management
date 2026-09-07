// Client-safe vocabulary for payment-method switches (Phase I-3): no prisma,
// no node:crypto, so views and forms can import it. The service is in
// ./method-controls.ts.

import { z } from "zod";

/** Methods that have a switch ("other" providers are not controllable). */
export const CONTROLLED_METHODS = ["credit", "qr", "convenience", "bank"] as const;
export type ControlledMethod = (typeof CONTROLLED_METHODS)[number];
export const isControlledMethod = (v: unknown): v is ControlledMethod => typeof v === "string" && (CONTROLLED_METHODS as readonly string[]).includes(v);

export const CONTROL_SCOPES = ["global", "merchant"] as const;
export type ControlScope = (typeof CONTROL_SCOPES)[number];

export const methodControlInputSchema = z
  .object({
    scope: z.enum(CONTROL_SCOPES),
    merchantId: z.string().trim().max(64).optional().nullable(),
    method: z.enum(CONTROLLED_METHODS),
    suspended: z.boolean(),
    /** Required when suspending. */
    reason: z.string().trim().max(500, "tooLong").default(""),
    /** ISO date-time; when set the cron resumes the method automatically. */
    resumeAt: z.string().trim().max(40).default(""),
  })
  .refine((v) => !v.suspended || v.reason.length > 0, { path: ["reason"], message: "required" })
  .refine((v) => v.scope === "global" || !!v.merchantId, { path: ["merchantId"], message: "required" });
export type MethodControlInput = z.infer<typeof methodControlInputSchema>;

export interface MethodControlRow {
  id: string;
  scope: ControlScope;
  merchantId: string | null;
  method: ControlledMethod;
  suspended: boolean;
  reason: string | null;
  suspendedById: string | null;
  /** Display name of the operator who suspended it (Phase P3-7); null for cron / unknown. */
  suspendedByName: string | null;
  suspendedAt: Date | null;
  resumeAt: Date | null;
  resumedAt: Date | null;
  updatedAt: Date;
}

