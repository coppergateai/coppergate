import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  authStatePath,
  loadE2eEnv,
  resolveProjectTarget,
} from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/ship-receipt";
  mkdirSync(out, { recursive: true });
  const target = resolveProjectTarget();
  const name =
    process.argv[2] === "after"
      ? "ship-receipt-after.png"
      : "ship-receipt-before.png";
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
  await page.waitForTimeout(900);
  if (page.url().includes("/login")) throw new Error("auth expired");

  const evidenceTab = page.getByRole("tab", { name: /evidence/i });
  await evidenceTab.click();
  await page.waitForTimeout(700);

  const receiptLink = page
    .locator(`a[href*="/projects/${target.projectId}/tasks/"][href$="/receipt"]`)
    .first();
  if ((await receiptLink.count()) === 0) {
    // Fall back: open a task, then receipt if present
    const taskLink = page
      .locator(`a[href*="/projects/${target.projectId}/tasks/"]`)
      .first();
    await taskLink.waitFor({ timeout: 20_000 });
    await taskLink.click();
    await page.waitForTimeout(1000);
    const fromTask = page.getByRole("link", { name: /ship receipt/i });
    if ((await fromTask.count()) > 0) {
      await fromTask.first().click();
    } else {
      // Navigate by appending /receipt to current task URL
      const u = page.url().replace(/\/?$/, "/receipt");
      await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45_000 });
    }
  } else {
    await receiptLink.click();
  }

  await page
    .getByRole("heading")
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1000);
  console.log("url", page.url());
  if (!page.url().includes("/receipt")) {
    throw new Error("did not reach ship receipt");
  }
  await page.screenshot({ path: `${out}/${name}`, fullPage: false });
  await browser.close();
  console.log("saved", `${out}/${name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
