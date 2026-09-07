// Build PDFs of the specification Markdown files with the Playwright Chromium
// that ships with the repository. Markdown → HTML with `marked`; Mermaid
// diagrams are rendered in the browser with the local `mermaid` bundle; the
// Noto Sans JP subset in lib/pdf/fonts/ is embedded so Japanese renders
// without system fonts.
//
//   npm install --no-save marked@12 mermaid@10
//   node docs/spec/build-pdf.mjs            # PDFs → docs/spec/pdf/<lang>-<name>.pdf
//   node docs/spec/build-pdf.mjs --png      # also rasterise every page to
//                                           # docs/spec/pdf/png/<lang>-<name>-<page>.png (needs pdftoppm or PyMuPDF; not committed)
//
// Readability (Phase P6-2):
//   - inline code never wraps (identifiers such as `INV-YYYYMM-<no>-<seq>` stay on
//     one line); only a code span longer than LONG_CODE_CHARS (a JSON shape) may wrap
//   - tables are set at 0.85em; a table that is wider than the portrait text
//     area is moved to a landscape page (CSS named page `@page landscape`),
//     and so is a Mermaid diagram that is markedly wider than tall
//   - a FILES entry may set `landscape: true` to print the whole document landscape

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { marked } from "marked";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = resolve(here, "pdf");
mkdirSync(outDir, { recursive: true });
const wantPng = process.argv.includes("--png");

/** [lang, name, options?] — options.landscape prints the whole file landscape. */
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
      if (lang === "mermaid") return `<pre class="mermaid" data-source="${escapeHtml(code).replace(/"/g, "&quot;")}">${escapeHtml(code)}</pre>`;
      return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(code)}</code></pre>\n`;
    },
    // Identifiers stay on one line; a long inline code (a JSON shape, a
    // long path list) may wrap, otherwise it would push a table off the page.
    codespan(text) {
      const long = text.length > LONG_CODE_CHARS;
      return `<code${long ? ' class="long"' : ""}>${text}</code>`;
    },
  },
});
const LONG_CODE_CHARS = 48;

// A4 portrait text area with the margins below: 210 − 28 = 182 mm; landscape: 297 − 28 = 269 mm.
const MARGIN = { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" };
const PORTRAIT_TEXT_MM = 182;
const LANDSCAPE_TEXT_MM = 269;

const css = (landscapeAll) => `
@font-face { font-family: "NotoJP"; src: url("${fontRegular}") format("truetype"); font-weight: 400; }
@font-face { font-family: "NotoJP"; src: url("${fontBold}") format("truetype"); font-weight: 700; }
@page { size: A4 ${landscapeAll ? "landscape" : "portrait"}; margin: ${MARGIN.top} ${MARGIN.right} ${MARGIN.bottom} ${MARGIN.left}; }
@page landscape { size: A4 landscape; }
* { box-sizing: border-box; }
body { font-family: "NotoJP", "WenQuanYi Zen Hei", sans-serif; font-size: 10.5pt; line-height: 1.55; color: #111; margin: 0; }
h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 4px; }
h2 { font-size: 15pt; margin-top: 28px; border-bottom: 1px solid #999; padding-bottom: 3px; page-break-after: avoid; }
h3 { font-size: 12.5pt; margin-top: 20px; page-break-after: avoid; }
h4 { font-size: 11pt; margin-top: 14px; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 0.85em; page-break-inside: auto; }
th, td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; text-align: left; word-break: break-word; }
th { background: #f0f0f0; }
tr { page-break-inside: avoid; }
code { font-family: "DejaVu Sans Mono", "Noto Sans Mono", monospace; font-size: 0.85em; background: #f4f4f4; padding: 0 3px; border-radius: 2px; white-space: nowrap; }
code.long { white-space: normal; word-break: break-all; }
pre { background: #f4f4f4; padding: 8px; border-radius: 4px; font-size: 8.5pt; overflow-x: auto; white-space: pre-wrap; word-break: break-all; page-break-inside: avoid; }
pre code { background: none; padding: 0; white-space: pre-wrap; }
pre.mermaid { background: #fff; border: 1px solid #ddd; text-align: center; page-break-inside: avoid; }
pre.mermaid svg { max-width: 100%; height: auto; max-height: 220mm; }
section.landscape { page: landscape; break-before: page; break-after: page; }
section.landscape pre.mermaid svg { max-height: 150mm; }
blockquote { border-left: 3px solid #999; margin: 8px 0; padding: 2px 10px; color: #444; }
a { color: #1a4fbf; text-decoration: none; }
hr { border: none; border-top: 1px solid #ccc; margin: 20px 0; }
img { max-width: 100%; }
li { margin: 2px 0; }
`;

/** Rasterise a PDF to PNG pages (pdftoppm, else PyMuPDF). Returns the number of pages or null. */
function rasterise(pdfPath, prefix) {
  const pngDir = resolve(outDir, "png");
  mkdirSync(pngDir, { recursive: true });
  const base = resolve(pngDir, prefix);
  const r1 = spawnSync("pdftoppm", ["-r", "60", "-png", pdfPath, base], { stdio: "ignore" });
  if (r1.status === 0) return true;
  const py = `import sys, fitz\nd = fitz.open(sys.argv[1])\nfor i, p in enumerate(d):\n    p.get_pixmap(dpi=60).save(f"{sys.argv[2]}-{i + 1:03d}.png")\nprint(len(d))\n`;
  const r2 = spawnSync("python3", ["-c", py, pdfPath, base], { encoding: "utf8" });
  return r2.status === 0 ? Number(r2.stdout.trim()) : null;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined, args: ["--no-sandbox"] });
const results = [];
for (const [lang, name, opts = {}] of FILES) {
  const mdPath = resolve(here, lang, `${name}.md`);
  if (!existsSync(mdPath)) continue;
  const md = readFileSync(mdPath, "utf8");
  const body = marked.parse(md);
  const landscapeAll = Boolean(opts.landscape);
  const textMm = landscapeAll ? LANDSCAPE_TEXT_MM : PORTRAIT_TEXT_MM;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${name}</title><style>${css(landscapeAll)}</style></head><body>${body}
<script>${mermaidJs}</script>
<script>
  window.__mermaidDone = false;
  window.__layout = { landscapeTables: 0, landscapeDiagrams: 0, diagrams: [] };
  (async () => {
    try {
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose", fontFamily: "NotoJP, sans-serif", flowchart: { htmlLabels: true }, sequence: { useMaxWidth: true }, er: { useMaxWidth: true, minEntityWidth: 80, minEntityHeight: 40, entityPadding: 8, diagramPadding: 10 } });
      await mermaid.run({ querySelector: "pre.mermaid" });
    } catch (e) { console.error("mermaid", e); }
    await document.fonts.ready;
    // Move overly wide tables and wide diagrams to landscape pages. The body
    // is laid out at the portrait text width (set below), so a table whose
    // content needs more than that would be squeezed or clipped in portrait.
    const textPx = ${textMm} * 96 / 25.4;
    const wrap = (el, kind) => {
      const sec = document.createElement("section");
      sec.className = "landscape";
      // Take the heading (and a short lead paragraph) that introduces the
      // element along, so the portrait page is not left with a lone heading.
      const lead = [];
      let prev = el.previousElementSibling;
      for (let n = 0; prev && n < 3; n++) {
        const tag = prev.tagName;
        const short = tag === "P" && (prev.textContent || "").length < 400;
        if (!(/^H[2-4]$/.test(tag) || short)) break;
        lead.unshift(prev);
        if (/^H[2-4]$/.test(tag)) break;
        prev = prev.previousElementSibling;
      }
      const first = lead[0] || el;
      first.parentNode.insertBefore(sec, first);
      for (const n of lead) sec.appendChild(n);
      sec.appendChild(el);
      window.__layout[kind]++;
    };
    if (!${landscapeAll}) {
      document.body.style.width = textPx + "px";
      const landscapeTextPx = ${LANDSCAPE_TEXT_MM} * 96 / 25.4;
      for (const table of Array.from(document.querySelectorAll("table"))) {
        // Minimum width: every cell wrapped at every opportunity (inline code
        // never wraps). A table whose minimum exceeds the portrait text width
        // cannot be laid out in portrait without squeezing a column.
        const probe = table.cloneNode(true);
        probe.style.width = "min-content";
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        document.body.appendChild(probe);
        const minimum = probe.getBoundingClientRect().width;
        probe.remove();
        if (minimum > textPx) wrap(table, "landscapeTables");
      }
      for (const pre of Array.from(document.querySelectorAll("pre.mermaid"))) {
        const svg = pre.querySelector("svg");
        if (!svg) continue;
        const vb = svg.viewBox && svg.viewBox.baseVal;
        const w = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
        const h = vb && vb.height ? vb.height : svg.getBoundingClientRect().height;
        if (!(w > 0 && h > 0)) continue;
        // Compare the scale each orientation can give the diagram (fit to width and height).
        const mm = 96 / 25.4;
        const portraitScale = Math.min(textPx / w, 220 * mm / h, 1);
        const landscapeScale = Math.min(landscapeTextPx / w, 150 * mm / h, 1);
        const landscape = landscapeScale > portraitScale * 1.25;
        window.__layout.diagrams.push({ w: Math.round(w), h: Math.round(h), scale: Number((landscape ? landscapeScale : portraitScale).toFixed(2)), landscape });
        if (landscape) wrap(pre, "landscapeDiagrams");
      }
      document.body.style.width = "";
    }
    window.__mermaidDone = true;
  })();
</script></body></html>`;
  const page = await browser.newPage({ viewport: { width: Math.round(textMm * 96 / 25.4), height: 1000 } });
  page.on("pageerror", (e) => console.error(`[${lang}/${name}] page error:`, e.message));
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => window.__mermaidDone === true, null, { timeout: 120_000 });
  const diagrams = await page.evaluate(() => {
    const pres = Array.from(document.querySelectorAll("pre.mermaid"));
    const broken = pres
      .map((pre, i) => ({ i, pre }))
      .filter(({ pre }) => !pre.querySelector("svg") || /Syntax error/i.test(pre.textContent || ""))
      .map(({ i, pre }) => `#${i + 1} ${(pre.dataset.source || "").split("\n").slice(0, 2).join(" / ")}`);
    return { total: pres.length, rendered: pres.length - broken.length, broken };
  });
  if (diagrams.broken.length) console.error(`[${lang}/${name}] mermaid syntax errors:`, diagrams.broken);
  const layout = await page.evaluate(() => window.__layout);
  const out = resolve(outDir, `${lang}-${name}.pdf`);
  await page.pdf({
    path: out,
    format: "A4",
    landscape: landscapeAll,
    preferCSSPageSize: true,
    printBackground: true,
    margin: MARGIN,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:7pt;width:100%;text-align:right;padding-right:14mm;color:#666;font-family:sans-serif">Wire Pay — ${name} (${lang})</div>`,
    footerTemplate: `<div style="font-size:7pt;width:100%;text-align:center;color:#666;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  await page.close();
  const pages = wantPng ? rasterise(out, `${lang}-${name}`) : undefined;
  results.push({ file: `${lang}-${name}.pdf`, diagrams, layout, ...(pages !== undefined ? { pages } : {}) });
  console.log(`✓ ${lang}/${name}.md → pdf/${lang}-${name}.pdf (mermaid ${diagrams.rendered}/${diagrams.total}, landscape tables ${layout.landscapeTables}, landscape diagrams ${layout.landscapeDiagrams}${pages ? `, ${pages} pages rasterised` : ""})`);
}
await browser.close();
writeFileSync(resolve(outDir, "build.json"), JSON.stringify({ builtAt: new Date().toISOString(), results }, null, 2));
