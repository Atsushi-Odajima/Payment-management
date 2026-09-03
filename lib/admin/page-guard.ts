// Server Component helpers: who is signed in, and redirects for pages that
// require a session or the master role.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
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

/** Redirects to /login (no session) or / (not master). */
export async function requireMasterPage(): Promise<CurrentAdmin> {
  const admin = await requireAdminPage();
  if (admin.role !== "master") redirect("/");
  return admin;
}
