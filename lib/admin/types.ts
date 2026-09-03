// Admin user (管理者) vocabulary. Role lives in lib/merchants/types (ROLES)
// because the merchant screens used it first; re-exported here for clarity.

export { ROLES, isRole, type Role } from "@/lib/role";
import type { Role } from "@/lib/role";

export const ADMIN_STATUSES = ["active", "disabled", "invited"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export function isAdminStatus(v: unknown): v is AdminStatus {
  return typeof v === "string" && (ADMIN_STATUSES as readonly string[]).includes(v);
}

/** Fields an operator edits on the admin form (loginId is immutable after creation). */
export interface AdminInput {
  name: string;
  email: string;
  role: Role;
  status: AdminStatus;
}

/** Creation adds the login id; the initial password is generated server-side. */
export interface AdminCreateInput extends AdminInput {
  loginId: string;
}

/** What the UI receives — never the password hash or TOTP secret. */
export interface AdminView extends AdminInput {
  id: string;
  loginId: string;
  totpEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The signed-in operator as seen by layouts, guards and audit records. */
export interface CurrentAdmin {
  id: string;
  loginId: string;
  name: string;
  email: string;
  role: Role;
  status: AdminStatus;
  totpEnabled: boolean;
}

export const LOGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const PASSWORD_MIN_LENGTH = 8;
