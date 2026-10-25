/**
 * Spot-check specific product URLs with auth.
 * Usage: pnpm --filter @coppergate/e2e-hosted exec tsx scripts/ux-spot-pages.ts
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

const ws = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";
const pages = [
  {
    id: "spot-activity",
    path: `/workspaces/${ws}/activity`,
  },
  {
    id: "spot-arena",
    path: `/workspaces/${ws}/arena`,
  },
  {
    id: "spot-project-overview",
    path: `/workspaces/${ws}/projects/1cf9259c-3ee3-439e-b6f5-d76ce775eea3`,
  },
  {
    id: "spot-delivery",
    path: `/workspaces/${ws}/projects/1cf9259c-3ee3-439e-b6f5-d76ce775eea3?tab=delivery`,
  },
  {
    id: "spot-task-detail",
    path: `/workspaces/${ws}/projects/3a045149-ae58-4321-a4f2-2099f89fd720/tasks/ff2e0570-d8bd-4478-876e-b2adb0367610`,
  },
];

async function main() {
  if (!existsSync(authStatePath())) {
    throw new Error("No auth — run pnpm e2e:login first");
  }
  const out = resolve(import.meta.dirname, "../.auth/ux-audit/spot");
  mkdirSync(out, { recursive: true });
  const base = baseUrl();

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const context = await browser.newContext({
    storageState: authStatePath(),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const notes: string[] = [];
  for (const route of pages) {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const res = await page.goto(`${base}${route.path}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1200);
    const title = await page.title();
    const h1 = await page.locator("h1").first().textContent().catch(() => null);
    const sample = (await page.locator("main").innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 500);
    const shot = resolve(out, `${route.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    notes.push(
      [
        `## ${route.id}`,
        `- status: ${res?.status() ?? "?"}`,
        `- landed: ${page.url()}`,
        `- title: ${title}`,
        `- h1: ${h1?.trim() ?? "—"}`,
        `- console: ${consoleErrors.length}`,
        `- sample: ${sample}`,
        `- shot: ${shot}`,
      ].join("\n"),
    );
    page.removeAllListeners("console");
    console.log(route.id, res?.status(), page.url());
  }

  writeFileSync(resolve(out, "report.md"), notes.join("\n\n"), "utf8");
  await browser.close();
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
