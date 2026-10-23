import { chromium } from "@playwright/test";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ storageState: authStatePath() });
  const page = await context.newPage();
  await page.goto(`${baseUrl()}/`, { waitUntil: "networkidle" });
  console.log("URL", page.url());
  console.log(
    "cookies",
    (await context.cookies()).map((c) => `${c.name}@${c.domain}`).join(", "),
  );
  console.log("---BODY---");
  console.log((await page.locator("body").innerText()).slice(0, 2000));
  console.log("---LINKS---");
  console.log(
    await page.$$eval("a[href]", (as) =>
      as.map((a) => a.getAttribute("href")).filter(Boolean).slice(0, 50),
    ),
  );
  await page.goto(`${baseUrl()}/profile`, { waitUntil: "domcontentloaded" });
  console.log("PROFILE URL", page.url());
  console.log((await page.locator("body").innerText()).slice(0, 1500));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
