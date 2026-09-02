// Server-only: reads a manual chapter from content/manual/<lang>/<chapter>.md.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Lang } from "@/lib/i18n";
import type { ManualChapter } from "./chapters";

export async function loadChapter(lang: Lang, chapter: ManualChapter): Promise<string> {
  const file = path.join(process.cwd(), "content", "manual", lang, `${chapter}.md`);
  return readFile(file, "utf8");
}
