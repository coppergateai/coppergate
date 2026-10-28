/**
 * Headless UX + service audit: screenshots + API snapshots.
 * Usage: pnpm --filter @coppergate/e2e-hosted exec tsx scripts/ux-audit.ts
 */
import { chromium, type Page, type APIResponse } from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

loadE2eEnv();

const outDir = resolve(import.meta.dirname, "../.auth/ux-audit");
const shotDir = resolve(outDir, "screenshots");

type PageVisit = {
  id: string;
  url: string;
  landed: string;
  title: string;
  ok: boolean;
  authRedirect: boolean;
  h1: string | null;
  textSample: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; status: number }>;
  screenshot: string;
  durationMs: number;
};

type ApiSnap = {
  path: string;
  status: number;
  ok: boolean;
  bodyPreview: unknown;
};

async function main(): Promise<void> {
  if (!existsSync(authStatePath())) {
    throw new Error("No auth — run pnpm e2e:login first");
  }

  mkdirSync(shotDir, { recursive: true });
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
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);

  const routes: Array<{ id: string; path: string; fullPage?: boolean }> = [
    { id: "01-landing", path: "/" },
    { id: "02-login", path: "/login" },
    { id: "03-docs", path: "/docs" },
    { id: "04-security", path: "/security" },
    { id: "05-changelog", path: "/changelog" },
    { id: "06-blog", path: "/blog" },
    { id: "07-ops-health", path: "/ops/health" },
    { id: "08-workspaces", path: "/workspaces" },
    { id: "09-profile", path: "/profile" },
    { id: "10-ws-overview", path: `/workspaces/${ws}` },
    { id: "11-ws-projects", path: `/workspaces/${ws}/projects` },
    { id: "12-ws-arena", path: `/workspaces/${ws}/arena`, fullPage: true },
    { id: "13-ws-inbox", path: `/workspaces/${ws}/inbox` },
    { id: "14-ws-activity", path: `/workspaces/${ws}/activity` },
    { id: "15-ws-settings", path: `/workspaces/${ws}/settings` },
    {
      id: "16-project-overview",
      path: `/workspaces/${ws}/projects/${project}`,
    },
    {
      id: "17-project-delivery",
      path: `/workspaces/${ws}/projects/${project}?tab=delivery`,
    },
    {
      id: "19-project-evidence",
      path: `/workspaces/${ws}/projects/${project}?tab=evidence`,
    },
    {
      id: "20-project-config",
      path: `/workspaces/${ws}/projects/${project}?tab=configuration`,
    },
  ];

  const visits: PageVisit[] = [];
  for (const route of routes) {
    visits.push(await visit(page, base, route.id, route.path, !!route.fullPage));
  }

  const apiPaths = [
    "/api/health",
    `/api/workspaces/${ws}/arena`,
    `/api/projects/${project}/pulls?workspaceId=${encodeURIComponent(ws)}`,
    `/api/workspaces/${ws}`,
  ];

  const apis: ApiSnap[] = [];
  for (const path of apiPaths) {
    const res = await context.request.get(`${base}${path}`);
    apis.push(await snapApi(res, path));
  }

  // Best-effort extras (may 404 depending on routes)
  for (const path of [
    `/api/workspaces/${ws}/activity`,
    `/api/workspaces/${ws}/inbox`,
    `/api/workspaces/${ws}/budget`,
    `/api/projects/${project}?workspaceId=${encodeURIComponent(ws)}`,
  ]) {
    try {
      const res = await context.request.get(`${base}${path}`);
      if (res.status() !== 404) {
        apis.push(await snapApi(res, path));
      }
    } catch {
      /* ignore */
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    baseUrl: base,
    workspaceId: ws,
    projectId: project,
    projectUrl: target.projectUrl,
    summary: {
      pagesVisited: visits.length,
      authRedirects: visits.filter((v) => v.authRedirect).length,
      pagesWithConsoleErrors: visits.filter((v) => v.consoleErrors.length).length,
      pagesWithFailedRequests: visits.filter((v) => v.failedRequests.length)
        .length,
      slowPages: visits
        .filter((v) => v.durationMs > 3000)
        .map((v) => ({ id: v.id, ms: v.durationMs })),
      apiOk: apis.filter((a) => a.ok).length,
      apiFail: apis.filter((a) => !a.ok).length,
    },
    visits,
    apis,
  };

  writeFileSync(
    resolve(outDir, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  writeFileSync(
    resolve(outDir, "report.md"),
    toMarkdown(report),
    "utf8",
  );

  console.log(`Wrote ${outDir}/report.md`);
  console.log(
    `Pages: ${visits.length} | console errs: ${report.summary.pagesWithConsoleErrors} | failed req pages: ${report.summary.pagesWithFailedRequests} | API fail: ${report.summary.apiFail}`,
  );
  await browser.close();
}

async function visit(
  page: Page,
  base: string,
  id: string,
  path: string,
  fullPage: boolean,
): Promise<PageVisit> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: Array<{ url: string; status: number }> = [];

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === "error") consoleErrors.push(clip(msg.text(), 300));
  };
  const onPageError = (err: Error) => pageErrors.push(clip(err.message, 300));
  const onResponse = (res: { url: () => string; status: () => number; request: () => { resourceType: () => string } }) => {
    const status = res.status();
    const type = res.request().resourceType();
    if (
      status >= 400 &&
      (type === "xhr" || type === "fetch" || type === "document")
    ) {
      failedRequests.push({ url: clip(res.url(), 180), status });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  const started = Date.now();
  const url = `${base}${path}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
  } catch (e) {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
    return {
      id,
      url,
      landed: page.url(),
      title: "",
      ok: false,
      authRedirect: page.url().includes("/login"),
      h1: null,
      textSample: clip(String(e), 400),
      consoleErrors,
      pageErrors,
      failedRequests,
      screenshot: "",
      durationMs: Date.now() - started,
    };
  }

  const shotPath = resolve(shotDir, `${id}.png`);
  await page.screenshot({ path: shotPath, fullPage });

  const h1 =
    (await page.locator("h1").first().textContent().catch(() => null))?.trim() ??
    null;
  const text = await page.locator("body").innerText().catch(() => "");
  const landed = page.url();

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  return {
    id,
    url,
    landed,
    title: await page.title().catch(() => ""),
    ok: !landed.includes("/login") || path === "/login" || path === "/",
    authRedirect: landed.includes("/login") && !path.startsWith("/login"),
    h1,
    textSample: clip(text.replace(/\s+/g, " ").trim(), 800),
    consoleErrors: uniq(consoleErrors).slice(0, 12),
    pageErrors: uniq(pageErrors).slice(0, 8),
    failedRequests: dedupeFailed(failedRequests).slice(0, 20),
    screenshot: shotPath,
    durationMs: Date.now() - started,
  };
}

async function snapApi(res: APIResponse, path: string): Promise<ApiSnap> {
  const status = res.status();
  let bodyPreview: unknown = null;
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as unknown;
      bodyPreview = summarizeJson(json);
    } catch {
      bodyPreview = clip(text, 400);
    }
  } catch {
    bodyPreview = null;
  }
  return { path, status, ok: status >= 200 && status < 400, bodyPreview };
}

function summarizeJson(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[…]";
  if (Array.isArray(value)) {
    return {
      _type: "array",
      length: value.length,
      sample: value.slice(0, 3).map((v) => summarizeJson(v, depth + 1)),
    };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(obj).slice(0, 40);
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.length > 120) out[k] = clip(v, 120);
      else out[k] = summarizeJson(v, depth + 1);
    }
    if (Object.keys(obj).length > 40) out._truncatedKeys = Object.keys(obj).length;
    return out;
  }
  return value;
}

function toMarkdown(report: {
  checkedAt: string;
  baseUrl: string;
  workspaceId: string;
  projectId: string;
  projectUrl: string;
  summary: Record<string, unknown>;
  visits: PageVisit[];
  apis: ApiSnap[];
}): string {
  const lines: string[] = [
    `# Coppergate UX audit`,
    ``,
    `- Checked: ${report.checkedAt}`,
    `- Base: ${report.baseUrl}`,
    `- Project: ${report.projectUrl}`,
    ``,
    `## Summary`,
    ``,
    "```json",
    JSON.stringify(report.summary, null, 2),
    "```",
    ``,
    `## Pages`,
    ``,
  ];
  for (const v of report.visits) {
    lines.push(`### ${v.id}`);
    lines.push(`- URL → ${v.landed}`);
    lines.push(`- title: ${v.title || "—"}`);
    lines.push(`- h1: ${v.h1 ?? "—"}`);
    lines.push(`- ${v.durationMs}ms | console:${v.consoleErrors.length} | failed:${v.failedRequests.length}`);
    if (v.consoleErrors.length) {
      lines.push(`- console: ${v.consoleErrors.join(" | ")}`);
    }
    if (v.failedRequests.length) {
      lines.push(
        `- failed: ${v.failedRequests.map((f) => `${f.status} ${f.url}`).join(" ; ")}`,
      );
    }
    lines.push(`- text: ${clip(v.textSample, 280)}`);
    lines.push(``);
  }
  lines.push(`## APIs`, ``);
  for (const a of report.apis) {
    lines.push(`### \`${a.path}\` — ${a.status}`);
    lines.push("```json");
    lines.push(JSON.stringify(a.bodyPreview, null, 2).slice(0, 2000));
    lines.push("```");
    lines.push(``);
  }
  return lines.join("\n");
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

function dedupeFailed(
  arr: Array<{ url: string; status: number }>,
): Array<{ url: string; status: number }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; status: number }> = [];
  for (const item of arr) {
    const key = `${item.status}|${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
