import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { IpRestrictionsView } from "@/components/views/ip-restrictions-view";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { IP_RESTRICTION_SELECT } from "@/app/api/ip-restrictions/select";
import { isIpTarget } from "@/lib/ip-restrictions/types";
import { clientIpFromHeaders, evaluateAllowList } from "@/lib/ip";

export const dynamic = "force-dynamic";

export default async function IpRestrictionsPage({
  searchParams,
}: {
  searchParams?: { target?: string; enabled?: string; page?: string };
}) {
  const target = isIpTarget(searchParams?.target) ? searchParams!.target! : "";
  const enabled = searchParams?.enabled === "1" || searchParams?.enabled === "0" ? searchParams.enabled : "";
  const page = parsePage(searchParams?.page);
  const where = {
    ...(target ? { target } : {}),
    ...(enabled ? { enabled: enabled === "1" } : {}),
  };

  const [rows, total, adminRules] = await Promise.all([
    prisma.ipRestriction.findMany({
      where,
      orderBy: [{ target: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
      select: IP_RESTRICTION_SELECT,
    }),
    prisma.ipRestriction.count({ where }),
    // The verdict is for the admin UI, so only enabled admin rules count.
    prisma.ipRestriction.findMany({ where: { target: "admin", enabled: true }, select: { cidr: true } }),
  ]);

  const h = headers();
  const clientIp = clientIpFromHeaders((n) => h.get(n));
  const verdict = clientIp ? evaluateAllowList(clientIp, adminRules.map((r) => r.cidr)) : null;

  return (
    <IpRestrictionsView
      rules={rows.map((r) => ({ ...r, target: isIpTarget(r.target) ? r.target : "admin" }))}
      clientIp={clientIp}
      verdict={verdict}
      target={target}
      enabled={enabled}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      total={total}
    />
  );
}
