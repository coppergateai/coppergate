/**
 * Designer audit: capture product screens for visual review.
 * Usage: pnpm exec tsx scripts/designer-tour.ts
 * Optional: OUT_SUBDIR=wave-1/after pnpm exec tsx scripts/designer-tour.ts
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

const artifactsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../artifacts/designer-pass",
);
const outDir = process.env.OUT_SUBDIR
  ? path.join(artifactsRoot, process.env.OUT_SUBDIR)
  : path.join(artifactsRoot, "pass-2/full");

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
  await capture(
    "04-overview",
    `${target.projectUrl}?tab=overview`,
    /Overview|Brief|Plan|Budget/i,
  );
  await capture(
    "05-delivery",
    `${target.projectUrl}?tab=delivery`,
    /Delivery|Backlog|Accepted/i,
  );
  await capture(
    "07-evidence",
    `${target.projectUrl}?tab=evidence`,
    /Evidence|Accept/i,
  );
  await capture(
    "08-configuration",
    `${target.projectUrl}?tab=configuration`,
    /Configuration|Policy|Maintainer|Settings/i,
  );
  await capture("09-arena", `${ws}/arena`, /Arena/i);
  await capture("10-inbox", `${ws}/inbox`, /Inbox|caught up|attention/i);
  await capture("11-insights", `${ws}/insights`, /Insights|Cost analytics|verified/i);
  await capture("12-activity", `${ws}/activity`, /Activity/i);

  for (const tab of [
    "connections",
    "general",
    "billing",
    "signals",
    "llm",
    "danger",
  ]) {
    await capture(
      `13-settings-${tab}`,
      `${ws}/settings?tab=${tab}`,
      /Settings|General|Billing|Connections|Danger|LLM|Signals/i,
    );
  }

  await capture("14-profile", `${root}/profile`, /Profile|Account/i);

  // Task detail + receipt
  await page.goto(`${target.projectUrl}?tab=delivery`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.evaluate(`(() => {
    localStorage.setItem("cg-theme","light");
    document.documentElement.setAttribute("data-theme","light");
  })()`);
  await page.waitForTimeout(600);
  const taskHref = await page
    .locator('a[href*="/tasks/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (taskHref) {
    const abs = taskHref.startsWith("http") ? taskHref : `${root}${taskHref}`;
    await capture("15-task-detail", abs, /Task|Tournament|Status|Evidence|Scope/i);
    const receipt = await page
      .locator('a[href*="/receipt"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (receipt) {
      const rAbs = receipt.startsWith("http") ? receipt : `${root}${receipt}`;
      await capture("16-receipt", rAbs, /Ship Receipt|Accept|Back to task/i);
    }
  }

  // Overlays on Mission Control
  await page.goto(ws, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(`(() => {
    localStorage.setItem("cg-theme","light");
    document.documentElement.setAttribute("data-theme","light");
  })()`);
  await page
    .getByText(/Mission Control/i)
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => null);
  await page.waitForTimeout(400);
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(outDir, "16-command-palette.png"),
    fullPage: false,
  });
  shots.push({ name: "16-command-palette", url: page.url(), notes: "overlay" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Shift+/");
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(outDir, "17-shortcuts.png"),
    fullPage: false,
  });
  shots.push({ name: "17-shortcuts", url: page.url(), notes: "overlay" });
  await page.keyboard.press("Escape");

  // Create flows
  await page.goto(`${root}/workspaces`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(`(() => {
    localStorage.setItem("cg-theme","light");
    document.documentElement.setAttribute("data-theme","light");
  })()`);
  await page.waitForTimeout(400);
  await page.locator('a[href="#create-workspace"]').click({ timeout: 5000 }).catch(() => null);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outDir, "18-create-workspace.png"),
    fullPage: false,
  });
  shots.push({ name: "18-create-workspace", url: page.url(), notes: "modal" });

  // Login (unauthenticated)
  const loginCtx = await browser.newContext({
    colorScheme: "light",
    viewport: { width: 1440, height: 900 },
  });
  const loginPage = await loginCtx.newPage();
  await loginPage.goto(`${root}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await loginPage.waitForTimeout(500);
  await loginPage.screenshot({
    path: path.join(outDir, "19-login.png"),
    fullPage: false,
  });
  shots.push({ name: "19-login", url: `${root}/login`, notes: "public" });
  await loginCtx.close();

  // Marketing smoke
  const pub = await browser.newContext({
    colorScheme: "light",
    viewport: { width: 1440, height: 900 },
  });
  const p = await pub.newPage();
  for (const [name, url, ready] of [
    ["20-home", `${root}/`, /Coppergate|Autonomy/i],
    ["21-docs", `${root}/docs`, /Docs|Documentation|Open Program/i],
    ["22-pricing", `${root}/docs/pricing`, /Community|Pricing|\\$0/i],
    ["23-security", `${root}/security`, /Security/i],
    ["24-changelog", `${root}/changelog`, /Changelog|Change/i],
  ] as const) {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p
      .getByText(ready)
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => null);
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
    shots.push({ name, url, notes: "marketing" });
    console.log(name);
  }
  await pub.close();

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
