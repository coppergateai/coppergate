import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  authStatePath,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/task-detail";
  mkdirSync(out, { recursive: true });
  const target = resolveProjectTarget();
  const name =
    process.argv[2] === "after"
      ? "task-detail-after.png"
      : "task-detail-before.png";
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
  await page.goto(target.projectUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(1000);
  if (page.url().includes("/login")) throw new Error("auth expired");

  const evidenceTab = page.getByRole("tab", { name: /evidence/i });
  await evidenceTab.click();
  await page.waitForTimeout(700);

  const taskLink = page
    .locator(`a[href*="/projects/${target.projectId}/tasks/"]`)
    .first();
  await taskLink.waitFor({ timeout: 20_000 });
  await taskLink.click();
  await page
    .getByRole("heading")
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await page
    .getByText(/hard gates|Retry \(new attempt\)|Ship Receipt/i)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(800);
  console.log("url", page.url());
  if (!page.url().includes("/tasks/")) {
    throw new Error("did not reach task detail");
  }
  await page.screenshot({ path: `${out}/${name}`, fullPage: false });
  await browser.close();
  console.log("saved", `${out}/${name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
