/**
 * Headless hosted check using saved auth. Prefer this over the Playwright runner.
 * Usage: pnpm e2e:check
 */
import { chromium, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";
import { fetchGitHubPulls } from "../helpers/github.js";
import {
  writeReport,
  type HostedCheckReport,
} from "../helpers/report.js";

loadE2eEnv();

async function main(): Promise<void> {
  if (!existsSync(authStatePath())) {
    throw new Error("No auth — run pnpm e2e:login first");
  }

  const target = resolveProjectTarget();
  const assertions: HostedCheckReport["assertions"] = [];

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const context = await browser.newContext({ storageState: authStatePath() });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  await page.goto(target.projectUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const landed = page.url();
  const authenticated = !landed.includes("/login");
  assertions.push({
    name: "session still valid",
    ok: authenticated,
    detail: landed,
  });
  if (!authenticated) {
    await browser.close();
    throw new Error("Session expired — re-run pnpm e2e:login");
  }

  const overview = await pageText(page);
  const projectName =
    (await page.locator("h1").first().textContent().catch(() => null))?.trim() ??
    null;
  const repoFullName =
    (await page
      .locator('a[href*="github.com/"]')
      .first()
      .textContent()
      .catch(() => null))
      ?.trim() ?? null;

  const tabs = {
    overview: clip(overview, 4000),
    delivery: await openTab(page, "delivery"),
    more: await openTab(page, "more"),
  };

  assertions.push({
    name: "Delivery tab renders",
    ok: tabs.delivery.length > 40,
    detail: `${tabs.delivery.length} chars`,
  });

  page.setDefaultTimeout(45_000);
  const arenaUrl = `${baseUrl()}/workspaces/${target.workspaceId}/arena`;
  await page.goto(arenaUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const arenaPageText = await pageText(page);
  const arenaLanded = !page.url().includes("/login");
  assertions.push({
    name: "workspace arena session",
    ok: arenaLanded,
    detail: page.url(),
  });
  assertions.push({
    name: "workspace arena Start/Stop + status",
    ok:
      (/Start/i.test(arenaPageText) || /Stop/i.test(arenaPageText)) &&
      /LIVE|STOPPED/i.test(arenaPageText),
    detail: clip(arenaPageText, 220),
  });
  const arenaApi = await context.request.get(
    `${baseUrl()}/api/workspaces/${target.workspaceId}/arena`,
  );
  assertions.push({
    name: "workspace arena API",
    ok: arenaApi.ok(),
    detail: arenaApi.ok()
      ? `${arenaApi.status()}`
      : `${arenaApi.status()} ${clip(await arenaApi.text(), 120)}`,
  });

  let coppergatePulls: HostedCheckReport["coppergatePulls"] = [];
  let coppergatePullsError: string | null = null;
  const pullsRes = await context.request.get(
    `${baseUrl()}/api/projects/${target.projectId}/pulls?workspaceId=${encodeURIComponent(target.workspaceId)}`,
  );
  if (pullsRes.ok()) {
    const body = (await pullsRes.json()) as {
      pulls?: Array<{ number: number; title: string; htmlUrl: string }>;
    };
    coppergatePulls = (body.pulls ?? []).map((p) => ({
      number: p.number,
      title: p.title,
      htmlUrl: p.htmlUrl,
    }));
    assertions.push({
      name: "Coppergate pulls API",
      ok: true,
      detail: `${coppergatePulls.length} open`,
    });
  } else {
    coppergatePullsError = `${pullsRes.status()} ${await pullsRes.text()}`;
    assertions.push({
      name: "Coppergate pulls API",
      ok: false,
      detail: coppergatePullsError.slice(0, 200),
    });
  }

  const openGh = await fetchGitHubPulls({ state: "open", limit: 30 });
  const closedGh = await fetchGitHubPulls({ state: "closed", limit: 15 });
  assertions.push({
    name: "GitHub API reachable",
    ok: true,
    detail: `${openGh.repo}: ${openGh.pulls.length} open`,
  });

  const toyTitleRe =
    /\b(scaffold project structure|tiny readme typo|propose next scoped improvement|scoped improvement)\b/i;
  const toyOpen = openGh.pulls.filter((p) => toyTitleRe.test(p.title));
  // Legacy toy PRs may still be open until closed; set CG_STRICT_TOY_PRS=1 to fail hard.
  const strictToy = process.env.CG_STRICT_TOY_PRS === "1";
  assertions.push({
    name: "no toy open PR titles",
    ok: !strictToy || toyOpen.length === 0,
    detail:
      toyOpen.length === 0
        ? "none"
        : `${toyOpen.map((p) => `#${p.number}`).join(", ")}${
            strictToy ? "" : " (warn; set CG_STRICT_TOY_PRS=1 to fail)"
          }`,
  });

  const report: HostedCheckReport = {
    checkedAt: new Date().toISOString(),
    baseUrl: baseUrl(),
    projectUrl: target.projectUrl,
    workspaceId: target.workspaceId,
    projectId: target.projectId,
    authenticated,
    projectName,
    repoFullName,
    budgetStatus: matchLabel(overview, /ACTIVE|EXHAUSTED|PAUSED|Budget[^\n]*/i),
    autonomyLevel: matchLabel(overview, /\bL[012]\b/),
    lastRunStatus: matchLabel(
      `${overview}\n${tabs.arena}\n${tabs.delivery}`,
      /QUEUED|RUNNING|FAILED|SUCCEEDED|IDLE|LIVE/i,
    ),
    tabs,
    coppergatePulls,
    coppergatePullsError,
    github: {
      repo: openGh.repo,
      open: openGh.pulls.map((p) => ({
        number: p.number,
        title: p.title,
        draft: p.draft,
        html_url: p.html_url,
        head: p.head?.ref,
        updated_at: p.updated_at,
      })),
      recentClosedOrMerged: closedGh.pulls.map((p) => ({
        number: p.number,
        title: p.title,
        merged: Boolean(p.merged_at),
        html_url: p.html_url,
        updated_at: p.updated_at,
      })),
    },
    assertions,
  };

  const mdPath = writeReport(report);
  await browser.close();

  console.log(`\n—— last-check.md (${mdPath}) ——\n`);
  const { readFileSync } = await import("node:fs");
  console.log(readFileSync(mdPath, "utf8"));

  const failed = assertions.filter((a) => !a.ok);
  if (failed.length) {
    console.error(
      `FAILED assertions: ${failed.map((a) => a.name).join(", ")}`,
    );
    process.exit(1);
  }
  console.log("All assertions passed.");
}

async function openTab(
  page: Page,
  tab: "delivery" | "more",
): Promise<string> {
  const label = tab === "delivery" ? "Delivery" : "More";
  const tabBtn = page.getByRole("tab", { name: new RegExp(`^${label}`) });
  if ((await tabBtn.count()) > 0) {
    await tabBtn.first().click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(600);
  } else {
    await page.goto(`${page.url().split("?")[0]}?tab=${tab}`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page.waitForTimeout(600);
  }
  return clip(await pageText(page), 4000);
}

async function pageText(page: Page): Promise<string> {
  return page
    .locator("main")
    .first()
    .innerText({ timeout: 10_000 })
    .catch(() => page.locator("body").innerText());
}

function matchLabel(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[0]?.trim().slice(0, 120) ?? null;
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
