import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { createBlacklistEntry, loadBlacklist, parseBlacklistFilters, parseBlacklistSort } from "@/lib/risk/blacklist";
import { blacklistCreateSchema } from "@/lib/risk/types";

/** GET /api/blacklist — entries (candidates first); `?format=csv` exports. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseBlacklistFilters(q);
  const sort = parseBlacklistSort(q);
  if (q.format === "csv") {
    const { rows } = await loadBlacklist({ filters, sort, page: 1, pageSize: CSV_MAX_ROWS });
    return csvResponse(
      toCsv(rows, [
        { header: "createdAt", value: (r) => r.createdAt },
        { header: "kind", value: (r) => r.kind },
        { header: "value", value: (r) => r.value },
        { header: "source", value: (r) => r.source },
        { header: "status", value: (r) => r.status },
        { header: "reason", value: (r) => r.reason },
        { header: "createdBy", value: (r) => r.createdBy?.loginId ?? "" },
      ]),
      "blacklist.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total, candidateCount } = await loadBlacklist({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ entries: rows, total, candidateCount, page, pageSize: DEFAULT_PAGE_SIZE });
});

/** POST /api/blacklist — manual entry (master), active immediately. */
export const POST = withApiHandler(async (req) => {
  const admin = await requirePermission(req, "blacklist", "create");
  const parsed = blacklistCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const row = await createBlacklistEntry(prisma, { ...parsed.data, actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok(row, { status: 201 });
});
