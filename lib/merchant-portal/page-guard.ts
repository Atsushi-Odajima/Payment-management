// Server Component helpers for the merchant portal (Phase L-2): resolve the
// merchant behind the portal cookie and redirect to /merchant/login when
// there is none. Independent of the operator session.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentMerchantFromToken, type CurrentMerchant } from "./session";
import { MERCHANT_COOKIE } from "./token";

export async function currentMerchantFromCookies(): Promise<CurrentMerchant | null> {
  return currentMerchantFromToken(prisma, cookies().get(MERCHANT_COOKIE)?.value);
}

export async function requireMerchantPage(): Promise<CurrentMerchant> {
  const m = await currentMerchantFromCookies();
  if (!m) redirect("/merchant/login");
  return m;
}
