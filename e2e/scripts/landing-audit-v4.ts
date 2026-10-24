/**
 * Marketing landing audit (v4): screenshots + CTA inventory.
 * Usage: pnpm --filter @coppergate/e2e-hosted exec tsx scripts/landing-audit-v4.ts
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const out = resolve(import.meta.dirname, "../.auth/landing-audit");

const pages = [
  "/",
  "/docs",
  "/docs/pricing",
  "/docs/limitations",
  "/docs/recovery",
  "/docs/supported-stack",
  "/security",
  "/changelog",
  "/blog",
  "/login",
  "/privacy",
  "/terms",
];

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const results: unknown[] = [];

  async function audit(
    viewport: { width: number; height: number },
    prefix: string,
  ) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    for (const path of pages) {
      const id =
        path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-");
      const consoleErrors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(350);
      const data = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("a,button")]
          .filter((el) => {
            const t = (el.textContent || "").replace(/\s+/g, " ").trim();
            return t.length > 0 && t.length < 48 && el.offsetParent !== null;
          })
          .slice(0, 50)
          .map((el) => ({
            text: (el.textContent || "").replace(/\s+/g, " ").trim(),
            href: el.getAttribute("href"),
          }));
        const h1 =
          document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ||
          null;
        const h2s = [...document.querySelectorAll("h2")]
          .map((h) => h.textContent?.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 10);
        const mains = document.querySelectorAll("main").length;
        const paid = /\$99|\$199|Buy Starter|Buy Pro|Start checkout/i.test(
          document.body.innerText,
        );
        const footerLede =
          document
            .querySelector("footer")
            ?.textContent?.replace(/\s+/g, " ")
            .trim()
            .slice(0, 200) || null;
        const hasFinal = Boolean(document.querySelector("#get-started"));
        const docsCta = Boolean(document.querySelector("[class*='docsCtaRow']"));
        return {
          title: document.title,
          h1,
          h2s,
          mains,
          paid,
          btns,
          footerLede,
          hasFinal,
          docsCta,
        };
      });
      const shot = `${prefix}-${id}.png`;
      await page.screenshot({ path: resolve(out, shot), fullPage: false });
      // bottom of page
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      await page.screenshot({
        path: resolve(out, `${prefix}-${id}-bottom.png`),
        fullPage: false,
      });
      results.push({
        path,
        viewport: viewport.width,
        shot,
        ...data,
        consoleErrors: consoleErrors.slice(0, 5),
      });
    }
    await context.close();
  }

  await audit({ width: 1440, height: 900 }, "v4");
  await audit({ width: 390, height: 844 }, "v4m");

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const tryHosted = page.locator("a", { hasText: /^Try hosted$/ }).first();
  const hrefs: Record<string, string | null> = {
    tryHosted: await tryHosted.getAttribute("href"),
    startGithub: await page
      .locator("a", { hasText: /Start on GitHub/ })
      .first()
      .getAttribute("href"),
    selfHostFinal: await page
      .locator("#get-started a", { hasText: /Self-host guide/ })
      .getAttribute("href"),
    pricingNav: await page
      .locator("header a", { hasText: /^Pricing$/ })
      .getAttribute("href"),
  };
  const navPrimary = page.locator("header a", { hasText: /Start on GitHub/ }).first();
  hrefs.navPrimary = await navPrimary.getAttribute("href");
  hrefs.navTryHosted = await page
    .locator("header a", { hasText: /^Try hosted$/ })
    .first()
    .getAttribute("href");
  await page.locator("header a", { hasText: /^Try hosted$/ }).first().click();
  await page.waitForLoadState("domcontentloaded");
  hrefs.afterClick = page.url();
  await page.screenshot({ path: resolve(out, "v4-click-login.png") });

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.locator("#get-started").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, "v4-final.png") });
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, "v4-footer.png") });

  // mobile menu CTAs
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const menuBtn = mpage.getByRole("button", { name: /open menu/i });
  await menuBtn.click();
  await mpage.waitForTimeout(400);
  await mpage.screenshot({ path: resolve(out, "v4m-menu.png") });
  hrefs.mobileDrawerCtas = (
    await mpage.locator(".drawer a, [class*='drawer'] a").allTextContents()
  )
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" | ");

  const summary = {
    hrefs,
    results: (results as Array<Record<string, unknown>>).map((r) => ({
      path: r.path,
      vp: r.viewport,
      h1: r.h1,
      paid: r.paid,
      mains: r.mains,
      hasFinal: r.hasFinal,
      docsCta: r.docsCta,
      title: r.title,
      footerLede: r.footerLede,
      ctas: (r.btns as Array<{ text: string; href: string | null }>)
        .filter((b) =>
          /Try|GitHub|Self-host|Pricing|Start|Docs|Login|Sign|Clone|View/i.test(
            b.text,
          ),
        )
        .slice(0, 14),
      h2s: r.h2s,
      errs: r.consoleErrors,
    })),
  };
  writeFileSync(resolve(out, "v4-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
