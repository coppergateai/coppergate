import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/settings";
  mkdirSync(out, { recursive: true });
  const ws = "2c894510-810e-46cc-8ff0-652f63870639";
  const root = baseUrl();
  const name =
    process.argv[2] === "after" ? "settings-after.png" : "settings-before.png";
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
  await page.goto(`${root}/workspaces/${ws}/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: /^settings$/i })
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await page
    .getByText(/GitHub|GitLab|Source control|Checking GitHub/i)
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1600);
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
