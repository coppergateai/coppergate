/**
 * Mobile viewport spot-check for premium UX.
 * Usage: pnpm --filter @coppergate/e2e-hosted exec tsx scripts/ux-mobile-spot.ts
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

loadE2eEnv();

async function main() {
  if (!existsSync(authStatePath())) {
    throw new Error("No auth — run pnpm e2e:login first");
  }
  const out = resolve(import.meta.dirname, "../.auth/ux-audit/mobile");
  mkdirSync(out, { recursive: true });
  const target = resolveProjectTarget();
  const base = baseUrl();
  const ws = target.workspaceId;
  const project = target.projectId;

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const context = await browser.newContext({
    storageState: authStatePath(),
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);

  const routes: Array<{ id: string; path: string }> = [
    { id: "m-overview", path: `/workspaces/${ws}` },
    { id: "m-projects", path: `/workspaces/${ws}/projects` },
    { id: "m-activity", path: `/workspaces/${ws}/activity` },
    { id: "m-project", path: `/workspaces/${ws}/projects/${project}` },
    {
      id: "m-config",
      path: `/workspaces/${ws}/projects/${project}?tab=configuration`,
    },
  ];

  for (const route of routes) {
    await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: resolve(out, `${route.id}.png`),
      fullPage: true,
    });
    console.log(route.id);
  }

  await browser.close();
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
