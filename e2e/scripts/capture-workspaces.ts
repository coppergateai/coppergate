import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/workspaces";
  mkdirSync(out, { recursive: true });
  const root = baseUrl();
  const name =
    process.argv[2] === "after"
      ? "workspaces-after.png"
      : "workspaces-before.png";
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
  await page.goto(`${root}/workspaces`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: /workspace/i })
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1000);
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
