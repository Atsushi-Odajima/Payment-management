import type { AdminView } from "./types";
import { isAdminStatus } from "./types";

/** Columns safe to send to the client — never passwordHash / totpSecretEnc. */
export const ADMIN_SELECT = {
  id: true,
  loginId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  totpEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function toAdminView(row: {
  id: string;
  loginId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  totpEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminView {
  return {
    ...row,
    role: row.role === "master" ? "master" : "general",
    status: isAdminStatus(row.status) ? row.status : "disabled",
  };
}
