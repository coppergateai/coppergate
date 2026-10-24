import { chromium } from "@playwright/test";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const out = resolve(import.meta.dirname, "../.auth/landing-audit");

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  page.setDefaultTimeout(25_000);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(out, "v5-home.png") });

  for (const id of ["fitness", "projects", "faq", "get-started"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.locator(`#${id}`).screenshot({
      path: resolve(out, `v5-sec-${id === "get-started" ? "final" : id}.png`),
    });
  }

  const fitnessCtas = await page.locator("#fitness a").allTextContents();
  const faqPrimary = await page
    .locator("#faq a")
    .filter({ hasText: /Self-host guide/ })
    .first()
    .getAttribute("href");
  const pilotCtas = await page.locator("#projects a").allTextContents();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(out, "v5-login.png") });
  const loginText = await page.locator("h1").innerText();
  const hasPricing = await page.locator('a[href="/docs/pricing"]').count();

  const m = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await m.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await m.waitForTimeout(400);
  await m.screenshot({ path: resolve(out, "v5m-login.png") });
  await m.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await m.waitForTimeout(400);
  await m.screenshot({ path: resolve(out, "v5m-home.png") });

  console.log(
    JSON.stringify(
      {
        fitnessCtas: fitnessCtas.map((t) => t.replace(/\s+/g, " ").trim()),
        faqPrimary,
        pilotHasCoppergate: pilotCtas.some((t) => /Coppergate on GitHub/i.test(t)),
        loginText,
        hasPricing,
      },
      null,
      2,
    ),
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
