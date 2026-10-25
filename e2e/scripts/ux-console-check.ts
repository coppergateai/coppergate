/**
 * Capture console/page errors for a single authenticated URL.
 * Usage: pnpm --filter @coppergate/e2e-hosted exec tsx scripts/ux-console-check.ts [path]
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main(): Promise<void> {
  if (!existsSync(authStatePath())) {
    throw new Error("No auth — run pnpm e2e:login first");
  }
  const pathArg =
    process.argv[2] ??
    "/workspaces/1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a/projects/1cf9259c-3ee3-439e-b6f5-d76ce775eea3";
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
  const failed: Array<{ url: string; status: number }> = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errs.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    errs.push(`page: ${err instanceof Error ? err.message : String(err)}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failed.push({ url: res.url(), status: res.status() });
    }
  });
  await page.goto(`${baseUrl()}${pathArg}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  console.log(JSON.stringify({ url: page.url(), errs, failed }, null, 2));
  await browser.close();
  if (errs.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
