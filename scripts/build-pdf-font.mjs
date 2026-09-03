#!/usr/bin/env node
// Rebuilds the Noto Sans JP subsets in lib/pdf/fonts from the full fonts.
//
//   node scripts/build-pdf-font.mjs <NotoSansJP-Regular.ttf> <NotoSansJP-Bold.ttf>
//
// Requires Python 3 with fontTools (`pip install fonttools`). The unicode
// list (JIS X 0208 = kana, symbols, JIS level 1 + 2 kanji) is
// scripts/pdf-font-unicodes.txt; the bold face keeps only rows before the
// level 2 kanji block to halve its size — the PDF layer falls back to
// Regular for any glyph the bold subset lacks (lib/pdf/document.ts).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [regular, bold] = process.argv.slice(2);
if (!regular || !bold) {
  console.error("usage: node scripts/build-pdf-font.mjs <Regular.ttf> <Bold.ttf>");
  process.exit(1);
}
const root = process.cwd();
const list = join(root, "scripts", "pdf-font-unicodes.txt");
const codes = readFileSync(list, "utf8").split("\n").filter(Boolean);
// JIS level 2 kanji start at U+4E00.. but are interleaved by code point; the
// level split is by Shift_JIS row, so the bold list is precomputed too.
const boldList = join(root, "scripts", "pdf-font-unicodes-bold.txt");
let boldCodes;
try {
  boldCodes = readFileSync(boldList, "utf8").split("\n").filter(Boolean);
} catch {
  boldCodes = codes;
}
writeFileSync("/tmp/wirepay-font-regular.txt", codes.join("\n"));
writeFileSync("/tmp/wirepay-font-bold.txt", boldCodes.join("\n"));
const common = ["--layout-features=", "--no-hinting", "--desubroutinize", "--drop-tables+=GSUB,GPOS,vhea,vmtx"];
execFileSync("pyftsubset", [regular, "--unicodes-file=/tmp/wirepay-font-regular.txt", ...common, `--output-file=${join(root, "lib/pdf/fonts/NotoSansJP-Regular.ttf")}`], { stdio: "inherit" });
execFileSync("pyftsubset", [bold, "--unicodes-file=/tmp/wirepay-font-bold.txt", ...common, `--output-file=${join(root, "lib/pdf/fonts/NotoSansJP-Bold.ttf")}`], { stdio: "inherit" });
console.log("fonts rebuilt in lib/pdf/fonts");
