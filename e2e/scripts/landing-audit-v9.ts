import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const out = resolve(import.meta.dirname, "../.auth/landing-audit");

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(out, "v9-home.png") });

  const home = await page.evaluate(() => {
    const text = document.body.innerText;
    const h2s = [...document.querySelectorAll("h2")].map((h) =>
      (h.textContent || "").replace(/\s+/g, " ").trim(),
    );
    return {
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim(),
      h2s,
      paid: /\$99|\$199|Buy Starter|Buy Pro/i.test(text),
      dogfood: /built by Coppergate/i.test(text),
      issuePr: /Issue → verified PR/i.test(text),
      programBound: /program-bound Arena/i.test(text),
      heroOpr: /What is Open Program Runtime/i.test(text),
      finalNote: document
        .querySelector("#early-access")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
      title: document.title,
    };
  });

  for (const id of ["projects", "faq", "get-started", "signals"]) {
    const loc = page.locator(`#${id}`);
    if (await loc.count()) {
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
      await loc.screenshot({ path: resolve(out, `v9-sec-${id}.png`) });
    }
  }

  await page.getByRole("link", { name: /What is Open Program Runtime/i }).click();
  await page.waitForURL("**/docs/open-program-runtime**");
  const oprFromHero = page.url();

  const secondary: Record<string, unknown> = {};
  for (const path of [
    "/docs/pricing",
    "/login",
    "/security",
    "/docs",
    "/blog",
    "/changelog",
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    const id = path.replace(/^\//, "").replace(/\//g, "-");
    await page.screenshot({ path: resolve(out, `v9-${id}.png`) });
    secondary[path] = await page.evaluate(() => ({
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim(),
      issuePr: /Issue → verified PR/i.test(document.body.innerText),
      openProgram: /Open Program/i.test(document.body.innerText),
      paid: /\$99|\$199/i.test(document.body.innerText),
    }));
  }

  // Mobile
  await browser.close();
  const mobileBrowser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const mobile = await (
    await mobileBrowser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await mobile.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await mobile.waitForTimeout(400);
  await mobile.screenshot({ path: resolve(out, "v9-mobile-home.png") });
  await mobileBrowser.close();

  const summary = { home, oprFromHero, secondary };
  writeFileSync(resolve(out, "v9-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
