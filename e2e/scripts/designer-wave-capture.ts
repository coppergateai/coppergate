/**
 * Capture chrome overlays + a page for designer waves.
 * Usage: WAVE=0 pnpm exec tsx scripts/designer-wave-capture.ts
 */
import { chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

const wave = process.env.WAVE || "0";
const phase = process.env.PHASE || "before";
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../../artifacts/designer-pass/wave-${wave}/${phase}`,
);

async function forceLight(page: Page) {
  await page.evaluate(`(() => {
    localStorage.setItem("cg-theme","light");
    document.documentElement.setAttribute("data-theme","light");
    document.documentElement.style.colorScheme="light";
  })()`);
}

async function waitReady(page: Page, ready: RegExp) {
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
  await page.waitForTimeout(400);
}

async function main() {
  loadE2eEnv();
  const target = resolveProjectTarget();
  const root = baseUrl();
  const ws = `${root}/workspaces/${target.workspaceId}`;
  await mkdir(rootDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const context = await browser.newContext({
    storageState: authStatePath(),
    colorScheme: "light",
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(
    `try { localStorage.setItem("cg-theme", "light"); } catch (e) {}`,
  );
  const page = await context.newPage();
  const shots: string[] = [];

  async function shot(name: string) {
    const file = path.join(rootDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    shots.push(name);
    console.log("shot", name);
  }

  if (wave === "0") {
    await page.goto(ws, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (page.url().includes("/login")) throw new Error("auth expired");
    await forceLight(page);
    await waitReady(page, /Mission Control/i);
    await shot("01-chrome-mc");

    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(350);
    await shot("02-command-palette");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);

    await page.keyboard.press("Shift+/");
    await page.waitForTimeout(350);
    await shot("03-shortcuts");
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ws, { waitUntil: "domcontentloaded", timeout: 45000 });
    await forceLight(page);
    await waitReady(page, /Mission Control/i);
    await shot("04-mobile-topbar");
    await page.locator('button[aria-label*="menu" i], button[aria-label*="Menu" i], button:has-text("Menu")').first().click({ timeout: 3000 }).catch(async () => {
      await page.locator("button").filter({ hasText: /^$/ }).first().click({ timeout: 2000 }).catch(() => null);
    });
    // open hamburger if present
    const menuBtn = page.locator(`.${"menu"}`).first();
    void menuBtn;
    await page.locator("header button, .topbar button").first().click({ timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(300);
    await shot("05-mobile-drawer");
  } else if (wave === "1") {
    const routes: [string, string, RegExp][] = [
      ["01-workspaces", `${root}/workspaces`, /Your workspaces/i],
      ["02-mission-control", ws, /Mission Control/i],
      ["03-projects", `${ws}/projects`, /Projects/i],
      ["04-overview", `${target.projectUrl}?tab=overview`, /Overview|Brief|Plan/i],
      ["05-delivery", `${target.projectUrl}?tab=delivery`, /Delivery|Backlog|Accepted/i],
      ["06-project-arena", `${target.projectUrl}?tab=arena`, /Arena/i],
      ["07-evidence", `${target.projectUrl}?tab=evidence`, /Evidence|Accept/i],
      ["08-configuration", `${target.projectUrl}?tab=configuration`, /Configuration|Policy|Maintainer/i],
      ["09-arena", `${ws}/arena`, /Arena/i],
      ["10-inbox", `${ws}/inbox`, /Inbox|caught up|attention/i],
    ];
    for (const [name, url, ready] of routes) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (page.url().includes("/login")) throw new Error("auth expired");
      await forceLight(page);
      await waitReady(page, ready);
      await shot(name);
    }
    // task + receipt if available
    await page.goto(`${target.projectUrl}?tab=delivery`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await forceLight(page);
    await waitReady(page, /Delivery|Backlog|Accepted/i);
    const taskHref = await page
      .locator('a[href*="/tasks/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (taskHref) {
      const abs = taskHref.startsWith("http") ? taskHref : `${root}${taskHref}`;
      await page.goto(abs, { waitUntil: "domcontentloaded", timeout: 45000 });
      await forceLight(page);
      await waitReady(page, /Task|Tournament|Status|Evidence/i);
      await shot("11-task-detail");
      const receipt = await page
        .locator('a[href*="/receipt"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      if (receipt) {
        const rAbs = receipt.startsWith("http") ? receipt : `${root}${receipt}`;
        await page.goto(rAbs, { waitUntil: "domcontentloaded", timeout: 45000 });
        await forceLight(page);
        await waitReady(page, /Ship Receipt|Accept|Back to task/i);
        await shot("12-receipt");
      }
    }
  } else if (wave === "2") {
    await page.goto(`${ws}/activity`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await forceLight(page);
    await waitReady(page, /Activity/i);
    await shot("01-activity");

    await page.goto(`${root}/workspaces`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await forceLight(page);
    await waitReady(page, /Your workspaces/i);
    await page.locator('a[href="#create-workspace"]').click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
    await shot("02-create-workspace");

    await page.goto(`${ws}/projects`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await forceLight(page);
    await waitReady(page, /Projects/i);
    await page.locator('a[href="#create-project"]').first().click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
    await shot("03-create-project");

    // login (no auth) — use fresh context
    const loginCtx = await browser.newContext({
      colorScheme: "light",
      viewport: { width: 1440, height: 900 },
    });
    const loginPage = await loginCtx.newPage();
    await loginPage.goto(`${root}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await loginPage.waitForTimeout(500);
    await loginPage.screenshot({ path: path.join(rootDir, "04-login.png") });
    shots.push("04-login");
    await loginCtx.close();
  } else if (wave === "3") {
    const tabs = [
      "connections",
      "general",
      "billing",
      "signals",
      "llm",
      "analytics",
      "danger",
    ];
    for (const tab of tabs) {
      await page.goto(`${ws}/settings?tab=${tab}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await forceLight(page);
      await waitReady(page, /Settings|General|Billing|Connections|Danger/i);
      await shot(`settings-${tab}`);
    }
    await page.goto(`${root}/profile`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await forceLight(page);
    await waitReady(page, /Profile|Account/i);
    await shot("profile");

    await page.goto(`${root}/not-a-real-page-404`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(500);
    await shot("not-found");
  } else if (wave === "4") {
    const publicRoutes: [string, string][] = [
      ["home", `${root}/`],
      ["docs", `${root}/docs`],
      ["pricing", `${root}/docs/pricing`],
      ["security", `${root}/security`],
      ["changelog", `${root}/changelog`],
      ["blog", `${root}/blog`],
      ["privacy", `${root}/privacy`],
      ["terms", `${root}/terms`],
    ];
    // marketing pages don't need auth
    const pub = await browser.newContext({
      colorScheme: "light",
      viewport: { width: 1440, height: 900 },
    });
    const p = await pub.newPage();
    for (const [name, url] of publicRoutes) {
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await p.waitForTimeout(600);
      await p.screenshot({ path: path.join(rootDir, `${name}.png`), fullPage: false });
      shots.push(name);
      console.log("shot", name);
    }
    await pub.close();
  }

  await writeFile(
    path.join(rootDir, "shots.json"),
    JSON.stringify({ wave, phase, at: new Date().toISOString(), shots }, null, 2),
  );
  await browser.close();
  console.log("wrote", rootDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
