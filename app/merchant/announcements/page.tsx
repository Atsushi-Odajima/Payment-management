import { MerchantAnnouncementsView } from "@/components/views/merchant/announcements-view";
import { loadActiveAnnouncements } from "@/lib/announcements/list";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";

export const dynamic = "force-dynamic";

export default async function MerchantAnnouncementsPage() {
  const m = await requireMerchantPage();
  const rows = await loadActiveAnnouncements(m.id);
  return <MerchantAnnouncementsView rows={rows.map((a) => ({ id: a.id, kind: a.kind, title: a.title, body: a.body, publishFrom: a.publishFrom, updates: a.updates.map((u) => ({ id: u.id, phase: u.phase, body: u.body, createdAt: u.createdAt })) }))} />;
}
