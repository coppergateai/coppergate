import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main() {
  const out = "artifacts/login";
  mkdirSync(out, { recursive: true });
  const root = baseUrl();
  const name =
    process.argv[2] === "after" ? "login-after.png" : "login-before.png";
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  // Fresh context — no auth — so we actually see login.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  await context.addInitScript(
    `try{localStorage.setItem("cg-theme","light")}catch(e){}`,
  );
  const page = await context.newPage();
  await page.goto(`${root}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: /sign in|log in|coppergate/i })
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(900);
  console.log("url", page.url());
  await page.screenshot({ path: `${out}/${name}`, fullPage: false });
  await browser.close();
  console.log("saved", `${out}/${name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
