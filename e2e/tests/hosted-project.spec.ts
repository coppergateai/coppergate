import { expect, test, type Page } from "@playwright/test";
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

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.skip(
  !existsSync(authStatePath()),
  "No auth state — run `pnpm e2e:login` first",
);

test("hosted project + GitHub PRs health check", async ({ page, request }) => {
  const target = resolveProjectTarget();
  const assertions: HostedCheckReport["assertions"] = [];

  await page.goto(target.projectUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const landed = page.url();
  const authenticated = !landed.includes("/login");
  assertions.push({
    name: "session still valid",
    ok: authenticated,
    detail: landed,
  });
  expect(authenticated, "Session expired — re-run pnpm e2e:login").toBe(true);

  const shellText = await pageText(page);
  const projectName = await firstText(page, ["h1", "[class*='projectTitle']"]);

  const repoFullName =
    (await page
      .locator('a[href*="github.com/"]')
      .first()
      .textContent()
      .catch(() => null))
      ?.trim() ?? null;

  const budgetStatus = matchLabel(
    shellText,
    /Budget[^\n]*|ACTIVE|EXHAUSTED|PAUSED/i,
  );
  const autonomyLevel = matchLabel(shellText, /\bL[012]\b|autonomy[^\n]*/i);
  const lastRunStatus = matchLabel(
    shellText,
    /QUEUED|RUNNING|FAILED|SUCCEEDED|IDLE|LIVE/i,
  );

  const tabs = {
    overview: clip(shellText, 4000),
    delivery: "",
    arena: "",
    more: "",
  };

  tabs.delivery = await clickTabAndCapture(page, /Delivery/i);
  tabs.arena = await clickTabAndCapture(page, /Agents/i);
  tabs.more = await clickTabAndCapture(page, /More/i);

  assertions.push({
    name: "Delivery tab renders",
    ok: tabs.delivery.length > 40,
    detail: `${tabs.delivery.length} chars`,
  });
  assertions.push({
    name: "Agents tab renders",
    ok: /Agents|Arena|Start|Stop|LIVE|IDLE|PAUSED|Contender/i.test(tabs.arena),
    detail: clip(tabs.arena, 160),
  });

  let coppergatePulls: HostedCheckReport["coppergatePulls"] = [];
  let coppergatePullsError: string | null = null;
  const pullsRes = await request.get(
    `/api/projects/${target.projectId}/pulls?workspaceId=${encodeURIComponent(target.workspaceId)}`,
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

  const report: HostedCheckReport = {
    checkedAt: new Date().toISOString(),
    baseUrl: baseUrl(),
    projectUrl: target.projectUrl,
    workspaceId: target.workspaceId,
    projectId: target.projectId,
    authenticated,
    projectName,
    repoFullName,
    budgetStatus,
    autonomyLevel,
    lastRunStatus,
    tabs: {
      overview: clip(tabs.overview, 4000),
      delivery: clip(tabs.delivery, 4000),
      arena: clip(tabs.arena, 4000),
      more: clip(tabs.more, 4000),
    },
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
  console.log(`\nReport written → ${mdPath}\n`);

  for (const a of assertions) {
    expect.soft(a.ok, `${a.name}: ${a.detail ?? ""}`).toBe(true);
  }
});

async function clickTabAndCapture(page: Page, name: RegExp): Promise<string> {
  const tab = page.getByRole("button", { name }).first();
  if (await tab.count()) {
    await tab.click().catch(() => undefined);
    await page.waitForTimeout(800);
  }
  return pageText(page);
}

async function pageText(page: Page): Promise<string> {
  return page
    .locator("main")
    .first()
    .innerText()
    .catch(() => page.locator("body").innerText());
}

async function firstText(
  page: Page,
  selectors: string[],
): Promise<string | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      const t = (await loc.textContent())?.trim();
      if (t) return t;
    }
  }
  return null;
}

function matchLabel(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[0]?.trim().slice(0, 120) ?? null;
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}
