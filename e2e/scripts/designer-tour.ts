/**
 * Designer audit: capture product screens for visual review.
 * Usage: pnpm exec tsx scripts/designer-tour.ts
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../artifacts/designer-pass",
);

async function main() {
  loadE2eEnv();
  const target = resolveProjectTarget();
  const root = baseUrl();
  const ws = `${root}/workspaces/${target.workspaceId}`;

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const context = await browser.newContext({
    storageState: authStatePath(),
    colorScheme: "light",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    `try { localStorage.setItem("cg-theme", "light"); } catch (e) {}`,
  );
  const page = await context.newPage();

  const shots: { name: string; url: string; notes: string }[] = [];

  async function capture(name: string, url: string, ready: RegExp) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (page.url().includes("/login")) throw new Error(`auth expired @ ${url}`);
    await page.evaluate(`(() => {
      localStorage.setItem("cg-theme","light");
      document.documentElement.setAttribute("data-theme","light");
      document.documentElement.style.colorScheme="light";
    })()`);
    await page
      .getByText(ready)
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => null);
    for (let i = 0; i < 16; i++) {
      const n = await page.locator("[class*='skeleton' i]").count();
      if (n === 0) break;
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(`(() => {
      const main = document.querySelector("main");
      const client = document.documentElement.clientWidth;
      const scrollW = document.documentElement.scrollWidth;
      const mainW = main ? Math.round(main.getBoundingClientRect().width) : 0;
      const overflowRight = [];
      for (const el of document.querySelectorAll("main *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 40 && r.right > client + 2) {
          overflowRight.push({
            cls: String(el.className || "").slice(0, 60),
            right: Math.round(r.right),
          });
          if (overflowRight.length >= 5) break;
        }
      }
      return {
        client,
        scrollW,
        hScroll: scrollW > client + 1,
        mainW,
        overflowRight,
        title: document.title,
      };
    })()`);

    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    shots.push({
      name,
      url: page.url(),
      notes: JSON.stringify(metrics),
    });
    console.log(name, metrics);
  }

  await capture("01-workspaces", `${root}/workspaces`, /Your workspaces/i);
  await capture("02-mission-control", ws, /Mission Control/i);
  await capture("03-projects", `${ws}/projects`, /Projects/i);
  await capture("04-arena", `${ws}/arena`, /Arena/i);
  await capture(
    "05-evidence",
    `${target.projectUrl}?tab=evidence`,
    /Evidence|Accept/i,
  );
  await capture(
    "06-delivery",
    `${target.projectUrl}?tab=delivery`,
    /Delivery|Backlog|Accepted/i,
  );
  await capture("07-activity", `${ws}/activity`, /Activity/i);
  await capture("08-inbox", `${ws}/inbox`, /Inbox|caught up|attention/i);
  await capture(
    "09-settings",
    `${ws}/settings`,
    /Settings|General|Billing|Connections/i,
  );

  const receipt = await page
    .locator('a[href*="/receipt"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (receipt) {
    const abs = receipt.startsWith("http") ? receipt : `${root}${receipt}`;
    await capture("10-receipt", abs, /Ship Receipt|Accept|Back to task/i);
  }

  await writeFile(
    path.join(outDir, "audit.json"),
    JSON.stringify({ at: new Date().toISOString(), shots }, null, 2),
  );
  await browser.close();
  console.log("wrote", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
