import { chromium } from "@playwright/test";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const out = resolve(import.meta.dirname, "../.auth/landing-audit");

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await desktop.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: resolve(out, "v4-home.png") });

  const navPrimary = await page
    .locator("header a", { hasText: /Start on GitHub/ })
    .first()
    .getAttribute("href");
  await page.locator("header a", { hasText: /^Try hosted$/ }).first().click();
  await page.waitForURL("**/login**");
  console.log("nav", { navPrimary, landed: page.url() });

  await page.goto(`${BASE}/docs/pricing`, { waitUntil: "domcontentloaded" });
  const pricingPrimary = await page
    .locator("a", { hasText: /^Self-host guide$/ })
    .first()
    .textContent();
  await page.screenshot({ path: resolve(out, "v4-pricing.png") });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(out, "v4-pricing-bottom.png") });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, "v4-footer.png") });
  const footer = await page.locator("footer").innerText();
  console.log("footerTagline", footer.includes("Agents compete"));
  console.log("pricingPrimary", pricingPrimary?.trim());

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const m = await mobile.newPage();
  m.setDefaultTimeout(20_000);
  await m.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const dismiss = m.getByRole("button", { name: /dismiss announcement/i });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }
  await m.waitForTimeout(200);
  const menu = m.locator('header button[aria-controls]');
  console.log("menuCount", await menu.count());
  await menu.click({ force: true });
  await m.waitForTimeout(500);
  const expanded = await menu.getAttribute("aria-expanded");
  const drawerLinks = await m.evaluate(() =>
    [...document.querySelectorAll("header a")]
      .map((a) => (a.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
  await m.screenshot({ path: resolve(out, "v4m-menu.png"), fullPage: true });
  console.log({ expanded, drawerLinks });

  // paid SKU sweep
  for (const path of ["/", "/docs/pricing", "/changelog", "/security"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    const paid = await page.evaluate(() =>
      /\$99|\$199|Buy Starter|Buy Pro/i.test(document.body.innerText),
    );
    console.log("paid", path, paid);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
