import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Lang } from "@/lib/i18n";
import type { ApiDocChapter } from "./chapters";

/** Markdown source of one API docs chapter (content/api-docs/<lang>/<chapter>.md). */
export async function loadApiDocChapter(lang: Lang, chapter: ApiDocChapter): Promise<string> {
  return readFile(path.join(process.cwd(), "content", "api-docs", lang, `${chapter}.md`), "utf8");
}
