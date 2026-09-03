// Regenerates the permission matrix tables from lib/role.ts (the single
// source of truth) into CLAUDE.md and content/manual/{ja,en}/intro.md,
// between the <!-- permissions:start --> / <!-- permissions:end --> markers.
//
//   npx tsx scripts/gen-permissions.ts          # write
//   npx tsx scripts/gen-permissions.ts --check  # exit 1 when the files are stale (CI)

import { readFileSync, writeFileSync } from "node:fs";
import { PERMISSIONS, RESOURCES, ROLES, rolesFor, type Resource } from "../lib/role";
import { ja } from "../lib/i18n/messages/ja";
import { en } from "../lib/i18n/messages/en";

type Lang = "ja" | "en";
const catalogs = { ja, en } as const;

function label(lang: Lang, group: "resource" | "action", key: string): string {
  const table = (catalogs[lang] as unknown as { permissions: Record<string, Record<string, string>> }).permissions[group];
  return table[key] ?? key;
}

function table(lang: Lang): string {
  const head = lang === "ja" ? ["機能", "操作", ...ROLES] : ["Feature", "Action", ...ROLES];
  const lines = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
  for (const resource of RESOURCES) {
    const actions = Object.keys(PERMISSIONS[resource as Resource]);
    for (const action of actions) {
      const roles = rolesFor(resource as Resource, action as never);
      const cells = ROLES.map((r) => (roles.includes(r) ? "○" : ""));
      lines.push(`| ${label(lang, "resource", resource)} | ${label(lang, "action", action)} | ${cells.join(" | ")} |`);
    }
  }
  return lines.join("\n");
}

function replaceBetween(path: string, body: string, check: boolean): boolean {
  const src = readFileSync(path, "utf8");
  const start = src.indexOf("<!-- permissions:start -->");
  const end = src.indexOf("<!-- permissions:end -->");
  if (start === -1 || end === -1 || end < start) throw new Error(`markers not found in ${path}`);
  const next = src.slice(0, start) + "<!-- permissions:start -->\n" + body + "\n" + src.slice(end);
  if (next === src) return false;
  if (!check) writeFileSync(path, next);
  return true;
}

const check = process.argv.includes("--check");
const targets: Array<[string, Lang]> = [
  ["CLAUDE.md", "ja"],
  ["content/manual/ja/intro.md", "ja"],
  ["content/manual/en/intro.md", "en"],
];
let stale = false;
for (const [path, lang] of targets) {
  const changed = replaceBetween(path, table(lang), check);
  if (changed) {
    stale = true;
    console.log(`${check ? "stale" : "updated"}: ${path}`);
  }
}
if (check && stale) {
  console.error("permission tables are out of date — run: npx tsx scripts/gen-permissions.ts");
  process.exit(1);
}
if (!stale) console.log("permission tables are up to date");
