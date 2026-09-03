// CSV export mode for personal data (Phase M-2): masked by default; the
// global setting csvPii = "full" lets admin / accounting export the real
// values. Route handlers call piiCsvMode(req) and pass it to the loaders.

import { prisma } from "@/lib/db";
import { currentAdminFromRequest } from "@/lib/admin/current";
import { loadGlobalSettings } from "@/lib/settings/global";
import type { PiiMode } from "./mask";

export async function piiCsvMode(req: Request): Promise<PiiMode> {
  const settings = await loadGlobalSettings(prisma);
  if (settings.csvPii !== "full") return "masked";
  const admin = await currentAdminFromRequest(req);
  return admin && (admin.role === "admin" || admin.role === "accounting") ? "full" : "masked";
}
