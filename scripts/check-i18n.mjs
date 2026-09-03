#!/usr/bin/env node
// Fails when Japanese text appears outside the places allowed to contain it.
// Unicode-aware (unlike a C-locale grep), so no false positives on ・ or —.
//
// Allowed:
//   lib/i18n/messages/ja.ts          the Japanese catalog itself
//   lib/providers/registry.ts        LocalizedText {ja, en} pairs (ja side)
//   components/language-toggle.tsx   the literal "日本語" toggle label
//   app/manifest.ts                  bilingual PWA metadata
//   prisma/seed-data.ts              demo data is intentionally Japanese
//   lib/email/templates.ts           default email texts for both languages
//   lib/pdf/receipt.ts, invoice.ts   receipt / invoice PDF copy (Japanese legal
//                                    documents with English sub-labels)
//
// Additionally, in registry.ts every {ja, en} pair whose ja side contains
// Japanese must have a *different* en side (identical proper nouns like
// "Stripe" are fine because they contain no Japanese characters).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib", "middleware.ts"];
const ALLOW = new Set([
  "lib/i18n/messages/ja.ts",
  "lib/providers/registry.ts",
  "lib/email/templates.ts",
  "lib/pdf/receipt.ts",
  "lib/pdf/invoice.ts",
  "components/language-toggle.tsx",
  "app/manifest.ts",
]);
const JP = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) {
    if (/\.(ts|tsx|mts)$/.test(path) && !/\.test\./.test(path)) yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry === ".next") continue;
    yield* walk(join(path, entry));
  }
}

let failures = 0;

for (const dir of SCAN_DIRS) {
  let files;
  try {
    files = [...walk(join(ROOT, dir))];
  } catch {
    continue;
  }
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (ALLOW.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Skip comments — they may legitimately reference Japanese terms.
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (JP.test(code)) {
        failures++;
        console.error(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

// registry.ts: ja/en pairs must differ when ja contains Japanese.
const registry = readFileSync(join(ROOT, "lib/providers/registry.ts"), "utf8");
const pairRe = /\{\s*ja:\s*"([^"]*)",\s*en:\s*"([^"]*)"\s*\}/g;
for (const m of registry.matchAll(pairRe)) {
  const [, ja, en] = m;
  if (JP.test(ja) && ja === en) {
    failures++;
    console.error(`lib/providers/registry.ts: untranslated pair "${ja}"`);
  }
  if (JP.test(en)) {
    failures++;
    console.error(`lib/providers/registry.ts: Japanese in en side "${en}"`);
  }
}

if (failures > 0) {
  console.error(`\n✗ check:i18n found ${failures} problem(s).`);
  process.exit(1);
}
console.log("✓ check:i18n: no untranslated strings outside the allowed files.");
