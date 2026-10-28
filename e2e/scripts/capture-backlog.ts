import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

/** Dogfood coppergate workspace — Open Program binds live here. */
const DOGFOOD_WS = "2c894510-810e-46cc-8ff0-652f63870639";

async function main() {
  const out = "artifacts/backlog";
  mkdirSync(out, { recursive: true });
  const root = baseUrl();
  const name =
    process.argv[2] === "after" ? "backlog-after.png" : "backlog-before.png";
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
  await page.goto(`${root}/workspaces/${DOGFOOD_WS}/backlog`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: /backlog/i })
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
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
