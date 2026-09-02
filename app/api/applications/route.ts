import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { APPLICATION_SELECT } from "./select";

/** GET /api/applications — pending first, then newest. */
export const GET = withApiHandler(async () => {
  const rows = await prisma.paymentApplication.findMany({
    orderBy: [{ appliedAt: "desc" }],
    select: APPLICATION_SELECT,
    take: 200,
  });
  rows.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  return ok({ applications: rows });
});
