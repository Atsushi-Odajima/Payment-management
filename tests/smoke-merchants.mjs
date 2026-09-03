// Manual end-to-end smoke for the merchant screens (not part of `npm test`).
//   DEMO_LOGIN_HINT=1 npx next start -p 3010 &
//   BASE=http://localhost:3010 node tests/smoke-merchants.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3010";
const PASSWORD = process.env.PASSWORD ?? "atusi0130";
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

// Login (master)
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#loginId", "kuromaru");
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
// The toast is shown before the client navigation finishes rendering the detail page.
await page.locator("h1").filter({ hasText: "Smoke Test Shop" }).waitFor({ timeout: 8000 });
check("created and redirected to detail with toast", (await page.locator("h1").textContent()) === "Smoke Test Shop");
check("detail shows assigned code MER-00004", (await page.textContent("body")).includes("MER-00004"));

// Password masking + role (master session)
check("password masked", (await page.textContent("body")).includes("********"));
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
const merchantUrl = page.url();

// Tabs (Phase B): contract & fees, deadlines, limits, API keys
await page.getByRole("link", { name: "Contract & fees" }).click();
await page.waitForURL(/tab=contract$/);
check("contract tab: no plan yet", (await page.textContent("body")).includes("No contract plan yet"));
await page.getByRole("button", { name: "Change contract" }).click();
await page.getByRole("group", { name: "Contract plan" }).getByText("Premium", { exact: true }).click();
check("premium rates prefilled (read-only)", (await page.getByLabel(/Rate \(%\)$/).first().inputValue()) === "3.2");
await page.getByRole("button", { name: "Register contract" }).click();
await page.getByText("Contract registered.").waitFor({ timeout: 8000 });
await page.waitForTimeout(500);
const currentContract = await page.locator("section[aria-labelledby=contract-current]").textContent();
check("contract registered → current plan shown", currentContract.includes("Premium") && currentContract.includes("Current"));
await page.fill("#transferDueDays", "10");
await page.getByRole("button", { name: "Save deadlines" }).click();
await page.getByText("Deadlines saved.").waitFor({ timeout: 8000 });
check("deadlines saved", true);
await page.screenshot({ path: `${OUT}/merchant-contract-en.png`, fullPage: false });

await page.getByRole("link", { name: "Limits", exact: true }).click();
await page.waitForURL(/tab=limits$/);
check("limits tab shows the test-mode badge", (await page.locator("section[aria-labelledby=limits-usage]").textContent()).includes("Test"));
await page.getByLabel(/Per transaction$/).first().fill("50000");
await page.getByRole("button", { name: "Save limits" }).click();
await page.getByText("Limits saved.").waitFor({ timeout: 8000 });
await page.waitForTimeout(500);
check("limit shown in the usage card", /50,000/.test(await page.locator("section[aria-labelledby=limits-usage]").textContent()));

await page.getByRole("link", { name: "API keys" }).click();
await page.waitForURL(/tab=apikeys$/);
check("api keys tab starts empty", (await page.textContent("body")).includes("No API keys have been issued yet."));
await page.fill("#apikey-label", "smoke");
await page.getByRole("button", { name: "Issue", exact: true }).click();
await page.locator("[role=status]").getByText("New key issued").waitFor({ timeout: 8000 });
const revealedKey = ((await page.locator("[role=status]").first().textContent()) ?? "").match(/wp_test_ak_[A-Za-z0-9]{32}/);
check("plaintext key revealed once", !!revealedKey);
await page.waitForTimeout(500);
check("key listed as active", (await page.locator("section[aria-labelledby=apikeys-list]").textContent()).includes("Active"));
const pingStatus = await page.evaluate(async (key) => (await fetch("/api/merchant-api/ping", { headers: { authorization: `Bearer ${key}` } })).status, revealedKey?.[0] ?? "");
check("merchant API ping accepts the key (200)", pingStatus === 200, String(pingStatus));
await page.screenshot({ path: `${OUT}/merchant-api-keys-en.png`, fullPage: false });

// Header test / live switch drives the server-rendered lists
const modeGroup = () => page.getByRole("group", { name: "Data mode" });
await modeGroup().getByRole("button", { name: "Live" }).click();
await page.waitForTimeout(800);
check("live mode pressed", (await modeGroup().getByRole("button", { name: "Live" }).getAttribute("aria-pressed")) === "true");
await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
const liveBody = await page.textContent("body");
check("live mode lists only live transactions", liveBody.includes("ORD-LIVE-001") && !liveBody.includes("ORD-DEMO-001"));
await modeGroup().getByRole("button", { name: "Test" }).click();
// The toggle writes the cookie and calls router.refresh(); wait for the re-rendered list.
await page.getByText("ORD-DEMO-001").first().waitFor({ timeout: 8000 });
const testBody = await page.textContent("body");
check("test mode lists the test transactions again", testBody.includes("ORD-DEMO-001") && !testBody.includes("ORD-LIVE-001"));

// A general-role session sees the mask only and the API refuses the reveal
{
  const gctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US" });
  const gp = await gctx.newPage();
  await gp.goto(BASE + "/login", { waitUntil: "networkidle" });
  await gp.fill("#loginId", "general");
  await gp.fill("#password", process.env.GENERAL_PASSWORD ?? "general1234");
  await gp.getByRole("button", { name: "Log in" }).click();
  await gp.waitForURL(BASE + "/");
  await gp.goto(merchantUrl, { waitUntil: "networkidle" });
  check("eye disabled for general role", await gp.getByRole("button", { name: "Show password" }).first().isDisabled());
  const status = await gp.evaluate(async () => {
    const id = location.pathname.split("/").pop();
    const r = await fetch(`/api/merchants/${id}/password`, { headers: { "x-requested-with": "fetch" } });
    return r.status;
  });
  check("API refuses password for general role (403)", status === 403, String(status));
  await gctx.close();
}
check("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
