/**
 * After login: use saved cookies to find a project URL and write e2e/.env
 */
import { chromium } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  parseProjectUrl,
  sessionMetaPath,
} from "../helpers/env.js";

loadE2eEnv();

const ENV_PATH = resolve(import.meta.dirname, "../.env");
const prefer = (process.env.CG_PROJECT_NAME ?? "kprompt-website").toLowerCase();

async function main(): Promise<void> {
  if (!existsSync(authStatePath())) {
    throw new Error("No auth — run pnpm e2e:login first");
  }

  const url = baseUrl();
  const browser = await chromium.launch({
    headless: true,
    channel: (process.env.PW_CHANNEL as "chrome" | undefined) ?? "chrome",
  });
  const context = await browser.newContext({ storageState: authStatePath() });
  const page = await context.newPage();

  await page.goto(`${url}/workspaces`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const wsProjectListHrefs = await page.$$eval('a[href*="/projects"]', (anchors) =>
    [
      ...new Set(
        anchors
          .map((a) => (a as HTMLAnchorElement).href.split("?")[0]!)
          .filter((h) => /\/workspaces\/[^/]+\/projects\/?$/.test(h)),
      ),
    ],
  );

  type Cand = { url: string; name: string };
  const cands: Cand[] = [];

  for (const listUrl of wsProjectListHrefs.slice(0, 5)) {
    await page.goto(listUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const rows = await page.$$eval('a[href*="/projects/"]', (anchors) =>
      anchors
        .map((a) => {
          const href = (a as HTMLAnchorElement).href.split("?")[0]!;
          if (!/\/workspaces\/[^/]+\/projects\/[^/]+\/?$/.test(href)) return null;
          const name = (a.textContent ?? "").trim().replace(/\s+/g, " ");
          return { url: href, name };
        })
        .filter(Boolean) as Cand[],
    );
    for (const r of rows) cands.push(r);
  }

  // Dedupe by url
  const byUrl = new Map<string, Cand>();
  for (const c of cands) {
    const prev = byUrl.get(c.url);
    if (!prev || c.name.length > prev.name.length) byUrl.set(c.url, c);
  }
  const projects = [...byUrl.values()];
  console.log(`Found ${projects.length} project(s)`);
  for (const p of projects) console.log(`  ${p.name || "(unnamed)"} → ${p.url}`);

  const chosen =
    projects.find((p) => p.name.toLowerCase().includes(prefer)) ??
    projects.find((p) => p.url.toLowerCase().includes(prefer)) ??
    projects[0];

  if (!chosen) {
    await browser.close();
    throw new Error("No projects found under this account");
  }

  const parsed = parseProjectUrl(chosen.url);
  if (!parsed) throw new Error(`Bad project url: ${chosen.url}`);

  writeFileSync(
    sessionMetaPath(),
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        baseUrl: url,
        projectName: chosen.name,
        ...parsed,
      },
      null,
      2,
    ),
  );
  upsertEnv("CG_PROJECT_URL", parsed.projectUrl);
  upsertEnv("CG_WORKSPACE_ID", parsed.workspaceId);
  upsertEnv("CG_PROJECT_ID", parsed.projectId);
  console.log(`Selected (${chosen.name}) → ${parsed.projectUrl}`);

  await browser.close();
}

function upsertEnv(key: string, value: string): void {
  let body = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  if (!body.trim()) {
    const example = resolve(import.meta.dirname, "../.env.example");
    if (existsSync(example)) body = readFileSync(example, "utf8");
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(body)) body = body.replace(re, line);
  else body = `${body.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
