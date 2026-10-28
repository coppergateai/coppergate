import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/agents-catalog";
  mkdirSync(out, { recursive: true });
  const ws = "2c894510-810e-46cc-8ff0-652f63870639";
  const root = baseUrl();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    storageState: authStatePath(),
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  await context.addInitScript(
    `try{localStorage.setItem("cg-theme","light")}catch(e){}`,
  );
  const page = await context.newPage();
  await page.goto(`${root}/workspaces/${ws}/agents`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(800);
  console.log("url", page.url());
  if (page.url().includes("/login")) {
    throw new Error("auth expired");
  }
  await page.screenshot({ path: `${out}/agents-desktop.png`, fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/agents-mobile.png`, fullPage: false });
  await browser.close();
  console.log("saved", out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
