// CSV export gate (Phase I-1): every `?format=csv` request passes through
// withApiHandler, which calls this. Staff roles may export; the viewer role
// (and anonymous visitors, who are treated as viewers) only when the global
// setting allows it.

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api/handler";
import { currentAdminFromRequest } from "@/lib/admin/current";
import { can, DEFAULT_ROLE } from "@/lib/role";
import { loadGlobalSettings } from "./global";

export async function assertCsvExportAllowed(req: Request): Promise<void> {
  const admin = await currentAdminFromRequest(req);
  const role = admin?.role ?? DEFAULT_ROLE;
  if (can(role, "csv", "export")) return;
  const settings = await loadGlobalSettings(prisma);
  if (settings.viewerCsvExport) return;
  throw new ApiError(403, "csv_export_disabled", "errors.csvExportDisabled");
}
