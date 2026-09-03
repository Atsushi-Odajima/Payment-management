import { cookies } from "next/headers";
import { ReportsView } from "@/components/views/reports-view";
import { modeFromCookieStore } from "@/lib/mode";
import { buildReport, parseReportFilters } from "@/lib/reports/service";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const report = await buildReport(parseReportFilters(searchParams, mode));
  return <ReportsView report={report} />;
}
