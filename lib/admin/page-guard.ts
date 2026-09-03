// Server Component helpers: who is signed in, and redirects for pages that
// require a session or a specific permission (lib/role.ts matrix).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
import { can, type ActionOf, type Resource } from "@/lib/role";
import { currentAdminFromToken } from "./current";
import type { CurrentAdmin } from "./types";

export async function currentAdminFromCookies(): Promise<CurrentAdmin | null> {
  return currentAdminFromToken(cookies().get(SESSION_COOKIE)?.value);
}

/** Redirects to /login when there is no session. */
export async function requireAdminPage(): Promise<CurrentAdmin> {
  const admin = await currentAdminFromCookies();
  if (!admin) redirect("/login");
  return admin;
}

/** Redirects to /login (no session) or / (role may not perform the action). */
export async function requirePermissionPage<R extends Resource>(resource: R, action: ActionOf<R>): Promise<CurrentAdmin> {
  const admin = await requireAdminPage();
  if (!can(admin.role, resource, action)) redirect("/");
  return admin;
}

/** Kept for the admin-management pages. */
export async function requireMasterPage(): Promise<CurrentAdmin> {
  return requirePermissionPage("admin_user", "view");
}
