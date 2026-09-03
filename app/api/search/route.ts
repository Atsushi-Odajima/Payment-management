import { ok, withApiHandler } from "@/lib/api/handler";
import { currentAdminFromRequest } from "@/lib/admin/current";
import { searchAll } from "@/lib/search";

/** GET /api/search?q= — grouped results for the header search box. */
export const GET = withApiHandler(async (req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const admin = await currentAdminFromRequest(req);
  return ok(await searchAll(q, { limit: 5, includeAdmins: admin?.role === "master" }));
});
