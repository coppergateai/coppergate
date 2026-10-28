/**
 * Capture screens for designer waves (pass 2).
 *
 *   PASS=2 WAVE=0 PHASE=before pnpm exec tsx scripts/designer-wave-capture.ts
 *   THEME=dark WAVE=0 PHASE=before pnpm exec tsx scripts/designer-wave-capture.ts
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

const pass = process.env.PASS || "2";
const wave = process.env.WAVE || "0";
const phase = process.env.PHASE || "before";
const theme = (process.env.THEME === "dark" ? "dark" : "light") as
  | "light"
  | "dark";
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../../artifacts/designer-pass/pass-${pass}/wave-${wave}/${phase}${theme === "dark" ? "-dark" : ""}`,
);

async function forceTheme(page: Page, t: "light" | "dark") {
  await page.evaluate(
    `((theme) => {
      localStorage.setItem("cg-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.colorScheme = theme;
    })(${JSON.stringify(t)})`,
  );
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
    colorScheme: theme,
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(
    `((t) => { try { localStorage.setItem("cg-theme", t); } catch (e) {} })(${JSON.stringify(theme)})`,
  );
  const page = await context.newPage();
  const shots: string[] = [];
  const skipped: string[] = [];

  async function shot(name: string, p: Page = page) {
    const file = path.join(rootDir, `${name}.png`);
    await p.screenshot({ path: file, fullPage: false });
    shots.push(name);
    console.log("shot", name);
  }

  async function gotoReady(url: string, ready: RegExp, p: Page = page) {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (p.url().includes("/login") && !url.includes("/login")) {
      throw new Error(`auth expired @ ${url}`);
    }
    await forceTheme(p, theme);
    await waitReady(p, ready);
  }

  if (wave === "0") {
    await gotoReady(ws, /Mission Control/i);
    await shot("01-chrome-mc");

    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(350);
    await shot("02-command-palette");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);

    await page.evaluate(`(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    })()`);
    await page.waitForTimeout(350);
    await shot("03-shortcuts");
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(ws, /Mission Control/i);
    await shot("04-mobile-topbar");
    await page.locator("header button, .topbar button").first().click({ timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(300);
    await shot("05-mobile-drawer");

    // dark companion if light run
    if (theme === "light") {
      await captureDarkSmoke(browser, root, ws, target, rootDir, shots);
    }
  } else if (wave === "1") {
    const routes: [string, string, RegExp][] = [
      ["01-workspaces", `${root}/workspaces`, /Your workspaces/i],
      ["02-mission-control", ws, /Mission Control/i],
      ["03-projects", `${ws}/projects`, /Projects/i],
      ["04-overview", `${target.projectUrl}?tab=overview`, /Overview|Brief|Plan|Budget/i],
      ["05-delivery", `${target.projectUrl}?tab=delivery`, /Delivery|Backlog|Accepted/i],
      ["06-project-arena", `${target.projectUrl}?tab=arena`, /Arena/i],
      ["07-evidence", `${target.projectUrl}?tab=evidence`, /Evidence|Accept/i],
      ["08-configuration", `${target.projectUrl}?tab=configuration`, /Configuration|Policy|Maintainer|Settings/i],
      ["09-arena", `${ws}/arena`, /Arena/i],
    ];
    for (const [name, url, ready] of routes) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoReady(url, ready);
      await shot(name);
    }

    await gotoReady(`${target.projectUrl}?tab=delivery`, /Delivery|Backlog|Accepted/i);
    const taskHref = await page
      .locator('a[href*="/tasks/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (taskHref) {
      const abs = taskHref.startsWith("http") ? taskHref : `${root}${taskHref}`;
      await gotoReady(abs, /Task|Tournament|Status|Evidence|Scope/i);
      await shot("10-task-detail");
      // scrolled sticky
      await page.evaluate(`(() => { window.scrollTo(0, Math.min(900, document.body.scrollHeight)); })()`);
      await page.waitForTimeout(300);
      await shot("11-task-sticky-scrolled");

      await page.setViewportSize({ width: 390, height: 844 });
      await gotoReady(abs, /Task|Tournament|Status|Evidence|Scope/i);
      await page.evaluate(`(() => { window.scrollTo(0, Math.min(700, document.body.scrollHeight)); })()`);
      await page.waitForTimeout(300);
      await shot("12-task-mobile-sticky");

      await page.setViewportSize({ width: 1440, height: 900 });
      const receipt = await page
        .locator('a[href*="/receipt"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      if (receipt) {
        const rAbs = receipt.startsWith("http") ? receipt : `${root}${receipt}`;
        await gotoReady(rAbs, /Ship Receipt|Accept|Back to task/i);
        await shot("13-receipt");
      } else {
        skipped.push("13-receipt");
      }
    } else {
      skipped.push("10-task-detail");
    }

    // mobile project tabs
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(`${target.projectUrl}?tab=overview`, /Overview|Brief|Plan/i);
    await shot("14-overview-mobile");
  } else if (wave === "2") {
    await gotoReady(`${ws}/inbox`, /Inbox|caught up|attention/i);
    await shot("01-inbox");
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(`${ws}/inbox`, /Inbox|caught up|attention/i);
    await shot("02-inbox-mobile");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoReady(`${ws}/activity`, /Activity/i);
    await shot("03-activity");

    await gotoReady(`${root}/workspaces`, /Your workspaces/i);
    await page.locator('a[href="#create-workspace"]').click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
    await shot("04-create-workspace");

    await gotoReady(`${ws}/projects`, /Projects/i);
    await page.locator('a[href="#create-project"]').first().click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
    await shot("05-create-project");

    const loginCtx = await browser.newContext({
      colorScheme: theme,
      viewport: { width: 1440, height: 900 },
    });
    const loginPage = await loginCtx.newPage();
    await loginPage.goto(`${root}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await forceTheme(loginPage, theme);
    await loginPage.waitForTimeout(500);
    await shot("06-login", loginPage);
    await loginCtx.close();
  } else if (wave === "3") {
    await gotoReady(`${ws}/insights`, /Insights|Cost analytics|verified/i);
    await shot("insights");
    await page.evaluate(`(() => { window.scrollTo(0, Math.min(600, document.body.scrollHeight)); })()`);
    await page.waitForTimeout(250);
    await shot("insights-scrolled");

    const tabs = [
      "connections",
      "general",
      "billing",
      "signals",
      "llm",
      "danger",
    ];
    for (const tab of tabs) {
      await gotoReady(`${ws}/settings?tab=${tab}`, /Settings|General|Billing|Connections|Danger|LLM|Signals/i);
      await shot(`settings-${tab}`);
      await page.evaluate(`(() => { window.scrollTo(0, Math.min(600, document.body.scrollHeight)); })()`);
      await page.waitForTimeout(250);
      await shot(`settings-${tab}-scrolled`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(`${ws}/settings?tab=llm`, /Settings|LLM|Model/i);
    await shot("settings-llm-mobile");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoReady(`${root}/profile`, /Profile|Account/i);
    await shot("profile");

    await page.goto(`${root}/not-a-real-page-404`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(500);
    await shot("not-found");

    const shareToken = process.env.SHARE_TOKEN?.trim();
    if (shareToken) {
      const pub = await browser.newContext({
        colorScheme: theme,
        viewport: { width: 1440, height: 900 },
      });
      const sp = await pub.newPage();
      await sp.goto(`${root}/share/r/${shareToken}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await forceTheme(sp, theme);
      await sp.waitForTimeout(600);
      await shot("share", sp);
      await pub.close();
    } else {
      skipped.push("share (set SHARE_TOKEN)");
      console.log("skip share — set SHARE_TOKEN to capture");
    }
  } else if (wave === "4") {
    const pub = await browser.newContext({
      colorScheme: theme,
      viewport: { width: 1440, height: 900 },
    });
    const p = await pub.newPage();
    const routes: [string, string, RegExp][] = [
      ["home", `${root}/`, /Coppergate|Autonomy/i],
      ["docs", `${root}/docs`, /Docs|Documentation|Open Program/i],
      ["docs-opr", `${root}/docs/open-program-runtime`, /Open Program|Runtime|Autonomy/i],
      ["docs-stack", `${root}/docs/supported-stack`, /Stack|Supported/i],
      ["docs-limitations", `${root}/docs/limitations`, /Limitation|Non-goal/i],
      ["docs-recovery", `${root}/docs/recovery`, /Recovery/i],
      ["pricing", `${root}/docs/pricing`, /Community|Pricing|\$0/i],
      ["security", `${root}/security`, /Security/i],
      ["changelog", `${root}/changelog`, /Changelog|Change/i],
      ["blog", `${root}/blog`, /Blog/i],
      ["blog-slug", `${root}/blog/multi-agent-arena-vs-chat`, /Arena|Agent|Chat/i],
      ["privacy", `${root}/privacy`, /Privacy/i],
      ["terms", `${root}/terms`, /Terms/i],
    ];
    for (const [name, url, ready] of routes) {
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await forceTheme(p, theme);
      await p
        .getByText(ready)
        .first()
        .waitFor({ timeout: 15000 })
        .catch(() => null);
      await p.waitForTimeout(500);
      await shot(name, p);
      if (name === "home") {
        await p.evaluate(`(() => { window.scrollTo(0, 900); })()`);
        await p.waitForTimeout(400);
        await shot("home-below-fold", p);
      }
    }
    await pub.close();
  }

  await writeFile(
    path.join(rootDir, "shots.json"),
    JSON.stringify(
      { pass, wave, phase, theme, at: new Date().toISOString(), shots, skipped },
      null,
      2,
    ),
  );
  await browser.close();
  console.log("wrote", rootDir, "skipped", skipped);
}

async function captureDarkSmoke(
  browser: Browser,
  root: string,
  ws: string,
  target: { projectUrl: string },
  outDir: string,
  shots: string[],
) {
  const darkDir = path.join(path.dirname(outDir), `${path.basename(outDir)}-dark-smoke`);
  await mkdir(darkDir, { recursive: true });
  const ctx = await browser.newContext({
    storageState: authStatePath(),
    colorScheme: "dark",
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(
    `try { localStorage.setItem("cg-theme", "dark"); } catch (e) {}`,
  );
  const p = await ctx.newPage();
  const urls: [string, string, RegExp][] = [
    ["dark-mc", ws, /Mission Control/i],
    ["dark-inbox", `${ws}/inbox`, /Inbox|caught up|attention/i],
    ["dark-arena", `${ws}/arena`, /Arena/i],
    ["dark-settings", `${ws}/settings?tab=general`, /Settings|General/i],
  ];
  for (const [name, url, ready] of urls) {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await forceTheme(p, "dark");
    await waitReady(p, ready);
    await p.screenshot({ path: path.join(darkDir, `${name}.png`), fullPage: false });
    shots.push(`smoke/${name}`);
    console.log("shot", `smoke/${name}`);
  }
  await writeFile(
    path.join(darkDir, "shots.json"),
    JSON.stringify({ theme: "dark", at: new Date().toISOString() }, null, 2),
  );
  await ctx.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
