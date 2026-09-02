import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { ManualView } from "@/components/views/manual-view";
import { isManualChapter } from "@/lib/manual/chapters";
import { loadChapter } from "@/lib/manual/load";
import { extractHeadings, parseMarkdown, renderBlocks } from "@/lib/manual/markdown";
import { LANG_COOKIE, resolveInitialLang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ManualChapterPage({ params }: { params: { chapter: string } }) {
  if (!isManualChapter(params.chapter)) notFound();
  // Same language resolution as the layout, so the chapter matches the UI.
  const lang = resolveInitialLang(cookies().get(LANG_COOKIE)?.value, headers().get("accept-language"));
  const md = await loadChapter(lang, params.chapter);
  const blocks = parseMarkdown(md);
  return (
    <ManualView chapter={params.chapter} headings={extractHeadings(blocks)}>
      {renderBlocks(blocks)}
    </ManualView>
  );
}
