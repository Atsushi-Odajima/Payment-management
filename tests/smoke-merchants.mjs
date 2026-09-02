// Manual end-to-end smoke for the merchant screens (not part of `npm test`).
//   ADMIN_PASSWORD=demo1234 npx next start -p 3010 &
//   BASE=http://localhost:3010 PASSWORD=demo1234 node tests/smoke-merchants.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3010";
const PASSWORD = process.env.PASSWORD ?? "demo1234";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined, args: ["--no-sandbox"] });
const results = [];
// Labels of required fields end with a "*" marker; match the accessible name loosely.
const L = (text) => new RegExp("^" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\*?$");
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US" });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// Login
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#password", PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(BASE + "/");

// List
await page.goto(BASE + "/merchants", { waitUntil: "networkidle" });
check("sidebar has Merchants", await page.getByRole("link", { name: "Merchants", exact: true }).first().isVisible());
const rows = page.locator("tbody tr");
check("list shows 3 seeded merchants", (await rows.count()) === 3);
check("list shows MER-00001 first", (await rows.first().textContent())?.includes("MER-00001"));
await page.screenshot({ path: `${OUT}/merchants-list-en.png` });
await rows.nth(1).click();
await page.waitForURL(/\/merchants\/[a-z0-9_]+$/);
check("row click opens detail", (await page.locator("h1").textContent())?.includes("サクラ茶舗"));

// New merchant form
await page.goto(BASE + "/merchants/new", { waitUntil: "networkidle" });
const submit = page.getByRole("button", { name: "Create merchant" });
check("submit disabled while required fields are empty", await submit.isDisabled());
check("provisional code shown", (await page.getByLabel(L("Merchant ID")).inputValue()) === "MER-00004");
await page.getByLabel(L("Site name")).fill("Smoke Test Shop");
await page.getByLabel(L("Site name (katakana)")).fill("hiragana");
await page.getByLabel(L("Company name")).fill("Smoke Inc.");
await page.getByLabel(L("Contact person")).fill("Tester");
await page.getByLabel(L("Email address")).fill("smoke@example.jp");
await page.getByLabel("Same as email address").check();
check("same-as-email copies the address", (await page.getByLabel(L("Statement email address")).inputValue()) === "smoke@example.jp");
await page.getByLabel(L("Notification URL")).fill("http://insecure.example.jp/notify");
check("submit enabled once required fields are filled", await submit.isEnabled());
await submit.click();
await page.waitForSelector("p[role=alert]");
const alerts = await page.locator("p[role=alert]").allTextContents();
check("inline errors: katakana + https", alerts.some((a) => /katakana/i.test(a)) && alerts.some((a) => /https/i.test(a)), alerts.join(" | "));
check("nothing was created on validation failure", (await page.url()).endsWith("/merchants/new"));

// Live preview reacts to selectors
await page.getByLabel(L("Notification format")).selectOption("query_get");
await page.waitForTimeout(150);
check("preview switches to GET", (await page.locator("pre").first().textContent())?.startsWith("GET"));
await page.getByLabel(L("Parameter set")).selectOption("full");
await page.getByLabel(L("Payment identifier")).selectOption("both");
await page.waitForTimeout(150);
const previewText = await page.locator("section[aria-live=polite]").textContent();
check("preview lists domain + both identifiers", previewText.includes("domain") && previewText.includes("payment_id") && previewText.includes("transaction_id"));

// Fix and submit
await page.getByLabel(L("Site name (katakana)")).fill("スモーク テスト ショップ");
await page.getByLabel(L("Notification URL")).fill("https://smoke.example.jp/notify");
await page.getByLabel(L("Notification format")).selectOption("json_post");
await page.screenshot({ path: `${OUT}/merchant-form-preview-en.png`, fullPage: false });
await submit.click();
await page.waitForURL(/\/merchants\/[a-z0-9]+$/, { timeout: 15000 });
await page.getByText("has been created").waitFor({ timeout: 5000 });
check("created and redirected to detail with toast", (await page.locator("h1").textContent()) === "Smoke Test Shop");
check("detail shows assigned code MER-00004", (await page.textContent("body")).includes("MER-00004"));

// Password masking + role
const eye = page.getByRole("button", { name: "Show password" }).first();
check("password masked", (await page.textContent("body")).includes("********"));
check("eye disabled for general role", await eye.isDisabled());
await page.getByRole("button", { name: "Master" }).click();
await page.waitForTimeout(600);
const eye2 = page.getByRole("button", { name: "Show password" }).first();
check("eye enabled for master role", await eye2.isEnabled());
await eye2.click();
await page.getByRole("button", { name: "Hide password" }).first().waitFor({ timeout: 5000 });
const revealed = await page.locator("[aria-live=polite].font-mono").first().textContent();
check("password revealed (16 chars, not mask)", revealed.trim().length === 16 && revealed !== "********", revealed);
check("regenerate visible for master", await page.getByRole("button", { name: "Regenerate" }).first().isVisible());
await page.screenshot({ path: `${OUT}/merchant-detail-en.png`, fullPage: false });

// Edit → update → toast → read-only
await page.getByRole("button", { name: "Edit" }).click();
await page.getByLabel(L("Site name")).fill("Smoke Test Shop v2");
await page.getByRole("button", { name: "Update" }).click();
await page.getByText("Merchant updated.").waitFor({ timeout: 8000 });
await page.waitForTimeout(400);
check("update → toast + back to read-only with new name", (await page.locator("h1").textContent()) === "Smoke Test Shop v2" && (await page.getByRole("button", { name: "Edit" }).isVisible()));

// General role cannot fetch the password via API even with the UI bypassed
await page.getByRole("button", { name: "General" }).click();
await page.waitForTimeout(400);
const status = await page.evaluate(async () => {
  const id = location.pathname.split("/").pop();
  const r = await fetch(`/api/merchants/${id}/password`, { headers: { "x-requested-with": "fetch" } });
  return r.status;
});
check("API refuses password for general role (403)", status === 403, String(status));
check("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
