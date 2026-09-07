import { ok, withApiHandler } from "@/lib/api/handler";
import { csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { buildAgentFees, parseAgentFeeFilters } from "@/lib/agent-fees/service";

/** GET /api/agent-fees?month=YYYY-MM&agent=&mode= — referral fees per agent; `?format=csv` exports the merchant breakdown. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseAgentFeeFilters(q, resolveMode(q.mode));
  const { rows, agents } = await buildAgentFees(filters);
  if (q.format === "csv") {
    const lines = rows.flatMap((r) => r.lines.map((l) => ({ ...l, agentCode: r.agentCode, agentName: r.name })));
    return csvResponse(
      toCsv(lines, [
        { header: "month", value: () => filters.month },
        { header: "agentCode", value: (l) => l.agentCode },
        { header: "agentName", value: (l) => l.agentName },
        { header: "merchantCode", value: (l) => l.merchantCode },
        { header: "siteName", value: (l) => l.siteName },
        { header: "batchId", value: (l) => l.batchId },
        { header: "periodFrom", value: (l) => l.periodFrom },
        { header: "periodTo", value: (l) => l.periodTo },
        { header: "batchStatus", value: (l) => l.status },
        { header: "netAmount", value: (l) => l.netAmount },
        { header: "feeRate", value: (l) => l.feeRate },
        { header: "fee", value: (l) => l.fee },
      ]),
      `agent-fees-${filters.month}.csv`,
      filters.mode,
    );
  }
  return ok({ month: filters.month, rows, agents });
});
