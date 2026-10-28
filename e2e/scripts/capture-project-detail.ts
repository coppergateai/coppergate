import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  authStatePath,
  baseUrl,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/project-detail";
  mkdirSync(out, { recursive: true });
  const target = resolveProjectTarget();
  const root = baseUrl();
  const name =
    process.argv[2] === "after"
      ? "project-detail-after.png"
      : "project-detail-before.png";
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    storageState: authStatePath(),
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  await context.addInitScript(
    `try{localStorage.setItem("cg-theme","light")}catch(e){}`,
  );
  const page = await context.newPage();
  const url =
    target.projectUrl ||
    `${root}/workspaces/${target.workspaceId}/projects/${target.projectId}`;
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(1400);
  console.log("url", page.url());
  if (page.url().includes("/login")) throw new Error("auth expired");
  await page.screenshot({ path: `${out}/${name}`, fullPage: false });
  await browser.close();
  console.log("saved", `${out}/${name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
