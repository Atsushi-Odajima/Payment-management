import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { IpRestrictionsView } from "@/components/views/ip-restrictions-view";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { IP_RESTRICTION_SELECT } from "@/app/api/ip-restrictions/select";
import { isIpMode, isIpTarget } from "@/lib/ip-restrictions/types";
import { loadAdminRules } from "@/lib/ip-restrictions/enforce";
import { clientIpFromHeaders, evaluateRules } from "@/lib/ip";

export const dynamic = "force-dynamic";

export default async function IpRestrictionsPage({
  searchParams,
}: {
  searchParams?: { target?: string; mode?: string; enabled?: string; page?: string };
}) {
  const target = isIpTarget(searchParams?.target) ? searchParams!.target! : "";
  const mode = isIpMode(searchParams?.mode) ? searchParams!.mode! : "";
  const enabled = searchParams?.enabled === "1" || searchParams?.enabled === "0" ? searchParams.enabled : "";
  const page = parsePage(searchParams?.page);
  const where = {
    ...(target ? { target } : {}),
    ...(mode ? { mode } : {}),
    ...(enabled ? { enabled: enabled === "1" } : {}),
  };

  const [rows, total, adminRules] = await Promise.all([
    prisma.ipRestriction.findMany({
      where,
      orderBy: [{ target: "asc" }, { mode: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
      select: IP_RESTRICTION_SELECT,
    }),
    prisma.ipRestriction.count({ where }),
    // The verdict is for the admin UI, so only enabled admin rules count.
    loadAdminRules(),
  ]);

  const h = headers();
  const clientIp = clientIpFromHeaders((n) => h.get(n));
  // A blocked caller never reaches this page (app/layout.tsx), so the verdict
  // here is allowed / denied / no_rules / unsupported.
  const verdict = clientIp ? evaluateRules(clientIp, adminRules) : null;

  return (
    <IpRestrictionsView
      rules={rows.map((r) => ({
        ...r,
        target: isIpTarget(r.target) ? r.target : "admin",
        mode: isIpMode(r.mode) ? r.mode : "allow",
      }))}
      clientIp={clientIp}
      verdict={verdict}
      target={target}
      mode={mode}
      enabled={enabled}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      total={total}
    />
  );
}
