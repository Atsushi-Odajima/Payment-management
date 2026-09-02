// Rasterizes the brand icon to the PNG sizes the app needs.
//
// Run with:  npm run icons:build   (tsx runs this file directly)
//
// The SVG comes from lib/wire-pay-icon.ts — the same geometry the React
// component renders — so there is exactly one definition of the icon.
// Rendering goes through headless Chromium (Playwright) because the SVG uses
// a serif <text> glyph (€) that pure SVG rasterizers handle inconsistently.
//
// Output:
//   app/icon.svg          browser tab favicon (vector)
//   app/icon.png          32×32 PNG fallback
//   app/apple-icon.png    180×180 (iOS home screen; iOS applies the corner radius)
//   public/icon-192.png   192×192 (PWA / Android)
//   public/icon-512.png   512×512 (PWA / Android)
//   public/og-icon.png    512×512 (social share previews)

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { buildWirePayIconSvg } from "../lib/wire-pay-icon";

const OUTPUTS = [
  { path: "app/icon.png", size: 32, rounded: true },
  { path: "app/apple-icon.png", size: 180, rounded: false },
  { path: "public/icon-192.png", size: 192, rounded: true },
  { path: "public/icon-512.png", size: 512, rounded: true },
  { path: "public/og-icon.png", size: 512, rounded: true },
];

mkdirSync("app", { recursive: true });
mkdirSync("public", { recursive: true });

writeFileSync("app/icon.svg", buildWirePayIconSvg({ size: 256, rounded: true }));
console.log("✓ app/icon.svg");

// CHROMIUM_BIN lets CI / sandboxes point at a preinstalled browser; otherwise
// Playwright's own bundled Chromium is used (npx playwright install chromium).
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || undefined,
  args: ["--no-sandbox"],
});

for (const { path, size, rounded } of OUTPUTS) {
  const svg = buildWirePayIconSvg({ size, rounded });
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block}
  </style></head><body>${svg}</body></html>`;
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(80);
  const buf = await page.screenshot({
    type: "png",
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  writeFileSync(path, buf);
  await ctx.close();
  console.log(`✓ ${path} (${size}×${size})`);
}

await browser.close();
console.log("done");
