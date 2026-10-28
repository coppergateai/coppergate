/**
 * Validate Playwright storageState against hosted Coppergate.
 * Usage: BASE_URL=https://www.coppergate.ai pnpm exec tsx scripts/check-auth-state.ts
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const state = authStatePath();
  if (!existsSync(state)) {
    console.error(`missing ${state}`);
    process.exit(1);
  }
  const root = baseUrl();
  const ws =
    process.env.DESIGN_SCOUT_WORKSPACE_ID?.trim() ||
    process.env.CG_WORKSPACE_ID?.trim() ||
    "2c894510-810e-46cc-8ff0-652f63870639";

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  try {
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await page.goto(`${root}/workspaces/${ws}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const url = page.url();
    const title = await page.title();
    const ok = !url.includes("/login");
    console.log(JSON.stringify({ ok, url, title, ws }, null, 2));
    process.exit(ok ? 0 : 2);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
