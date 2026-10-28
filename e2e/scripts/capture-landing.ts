import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/landing";
  mkdirSync(out, { recursive: true });
  const root = baseUrl();
  const suffix = process.argv[2] === "after" ? "after" : "before";
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  await context.addInitScript(
    `try{localStorage.setItem("cg-theme","light")}catch(e){}`,
  );
  const page = await context.newPage();
  await page.goto(`${root}/`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page
    .getByRole("heading")
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1000);
  console.log("url", page.url());
  await page.screenshot({
    path: `${out}/landing-${suffix}.png`,
    fullPage: false,
  });
  await page.screenshot({
    path: `${out}/landing-${suffix}-full.png`,
    fullPage: true,
  });
  // Mobile first viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${out}/landing-${suffix}-mobile.png`,
    fullPage: false,
  });
  await browser.close();
  console.log("saved", `${out}/landing-${suffix}*.png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
