/**
 * Dump console errors for a route.
 * Usage: pnpm --filter @coppergate/e2e-hosted exec tsx scripts/ux-console-dump.ts /path
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const path =
    process.argv[2] ??
    "/workspaces/1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a/projects/1cf9259c-3ee3-439e-b6f5-d76ce775eea3";
  if (!existsSync(authStatePath())) throw new Error("No auth");
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const context = await browser.newContext({
    storageState: authStatePath(),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errs: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text());
  });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${baseUrl()}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  console.log(JSON.stringify({ url: page.url(), errs, failed }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
