// Build PDFs of the specification Markdown files with the Playwright Chromium
// that ships with the repository. Markdown → HTML with `marked`; Mermaid
// diagrams are rendered in the browser with the local `mermaid` bundle; the
// Noto Sans JP subset in lib/pdf/fonts/ is embedded so Japanese renders
// without system fonts.
//
//   npm install --no-save marked@12 mermaid@10
//   node docs/spec/build-pdf.mjs
//
// Output: docs/spec/pdf/<lang>-<name>.pdf

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = resolve(here, "pdf");
mkdirSync(outDir, { recursive: true });

const FILES = [
  ["ja", "A-merchant-integration-spec"],
  ["ja", "B-provider-connection-spec"],
  ["ja", "glossary"],
  ["en", "A-merchant-integration-spec"],
  ["en", "B-provider-connection-spec"],
  ["en", "glossary"],
];

const mermaidJs = readFileSync(resolve(root, "node_modules/mermaid/dist/mermaid.min.js"), "utf8");
const fontRegular = pathToFileURL(resolve(root, "lib/pdf/fonts/NotoSansJP-Regular.ttf")).href;
const fontBold = pathToFileURL(resolve(root, "lib/pdf/fonts/NotoSansJP-Bold.ttf")).href;

// Turn ```mermaid fences into <pre class="mermaid"> so the browser renders them.
// marked v12: renderer.code(code, infostring, escaped)
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
marked.use({
  gfm: true,
  renderer: {
    code(code, infostring) {
      const lang = (infostring || "").trim().split(/\s+/)[0];
      if (lang === "mermaid") return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
      return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(code)}</code></pre>\n`;
    },
  },
});

const css = `
@font-face { font-family: "NotoJP"; src: url("${fontRegular}") format("truetype"); font-weight: 400; }
@font-face { font-family: "NotoJP"; src: url("${fontBold}") format("truetype"); font-weight: 700; }
* { box-sizing: border-box; }
body { font-family: "NotoJP", "WenQuanYi Zen Hei", sans-serif; font-size: 10.5pt; line-height: 1.55; color: #111; margin: 0; }
h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 4px; }
h2 { font-size: 15pt; margin-top: 28px; border-bottom: 1px solid #999; padding-bottom: 3px; page-break-after: avoid; }
h3 { font-size: 12.5pt; margin-top: 20px; page-break-after: avoid; }
h4 { font-size: 11pt; margin-top: 14px; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 9pt; page-break-inside: auto; }
th, td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; text-align: left; word-break: break-word; }
th { background: #f0f0f0; }
tr { page-break-inside: avoid; }
code { font-family: "DejaVu Sans Mono", "Noto Sans Mono", monospace; font-size: 8.5pt; background: #f4f4f4; padding: 0 3px; border-radius: 2px; }
pre { background: #f4f4f4; padding: 8px; border-radius: 4px; font-size: 8.5pt; overflow-x: auto; white-space: pre-wrap; word-break: break-all; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
pre.mermaid { background: #fff; border: 1px solid #ddd; text-align: center; }
pre.mermaid svg { max-width: 100%; height: auto; }
blockquote { border-left: 3px solid #999; margin: 8px 0; padding: 2px 10px; color: #444; }
a { color: #1a4fbf; text-decoration: none; }
hr { border: none; border-top: 1px solid #ccc; margin: 20px 0; }
img { max-width: 100%; }
li { margin: 2px 0; }
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined, args: ["--no-sandbox"] });
const results = [];
for (const [lang, name] of FILES) {
  const mdPath = resolve(here, lang, `${name}.md`);
  if (!existsSync(mdPath)) continue;
  const md = readFileSync(mdPath, "utf8");
  const body = marked.parse(md);
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${name}</title><style>${css}</style></head><body>${body}
<script>${mermaidJs}</script>
<script>
  window.__mermaidDone = false;
  (async () => {
    try {
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose", fontFamily: "NotoJP, sans-serif", flowchart: { htmlLabels: true }, sequence: { useMaxWidth: true }, er: { useMaxWidth: true } });
      await mermaid.run({ querySelector: "pre.mermaid" });
    } catch (e) { console.error("mermaid", e); }
    await document.fonts.ready;
    window.__mermaidDone = true;
  })();
</script></body></html>`;
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error(`[${lang}/${name}] page error:`, e.message));
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => window.__mermaidDone === true, null, { timeout: 120_000 });
  const diagrams = await page.evaluate(() => ({ total: document.querySelectorAll("pre.mermaid").length, rendered: document.querySelectorAll("pre.mermaid svg").length }));
  const out = resolve(outDir, `${lang}-${name}.pdf`);
  await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" }, displayHeaderFooter: true, headerTemplate: `<div style="font-size:7pt;width:100%;text-align:right;padding-right:14mm;color:#666;font-family:sans-serif">Wire Pay — ${name} (${lang})</div>`, footerTemplate: `<div style="font-size:7pt;width:100%;text-align:center;color:#666;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>` });
  await page.close();
  results.push({ file: `${lang}-${name}.pdf`, diagrams });
  console.log(`✓ ${lang}/${name}.md → pdf/${lang}-${name}.pdf (mermaid ${diagrams.rendered}/${diagrams.total})`);
}
await browser.close();
writeFileSync(resolve(outDir, "build.json"), JSON.stringify({ builtAt: new Date().toISOString(), results }, null, 2));
