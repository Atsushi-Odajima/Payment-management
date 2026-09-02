// Operator role for the demo: "master" may reveal / regenerate merchant
// passwords, "general" only sees the mask. The role lives in a cookie so both
// the server (API + SSR) and the client toggle agree — same pattern as the
// language cookie. In a real deployment this would come from the user's
// session, not a self-service toggle.

import { isRole, type Role } from "@/lib/merchants/types";

export const ROLE_COOKIE = "wirepay.role";
export const DEFAULT_ROLE: Role = "general";

export function roleFromCookieHeader(cookieHeader: string | null | undefined): Role {
  if (!cookieHeader) return DEFAULT_ROLE;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === ROLE_COOKIE) {
      const v = rest.join("=");
      return isRole(v) ? v : DEFAULT_ROLE;
    }
  }
  return DEFAULT_ROLE;
}

export function roleFromRequest(req: Request): Role {
  return roleFromCookieHeader(req.headers.get("cookie"));
}

export function resolveRole(cookieValue: string | undefined): Role {
  return isRole(cookieValue) ? cookieValue : DEFAULT_ROLE;
}
