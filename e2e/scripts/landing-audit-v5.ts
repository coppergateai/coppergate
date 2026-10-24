/**
 * Marketing landing audit (v5): section screenshots + CTA / narrative scan.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const out = resolve(import.meta.dirname, "../.auth/landing-audit");

const homeSections = [
  { id: "hero", sel: "section.hero, [class*='hero']" },
  { id: "arena", sel: "#arena" },
  { id: "how", sel: "#how-it-works" },
  { id: "evidence", sel: "#evidence" },
  { id: "fitness", sel: "#fitness" },
  { id: "signals", sel: "#signals" },
  { id: "controls", sel: "#controls" },
  { id: "projects", sel: "#projects" },
  { id: "faq", sel: "#faq" },
  { id: "final", sel: "#get-started" },
];

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(out, "v5-home.png") });

  const sectionReport: unknown[] = [];
  for (const s of homeSections) {
    const loc = page.locator(s.sel).first();
    if (!(await loc.count())) {
      sectionReport.push({ id: s.id, found: false });
      continue;
    }
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await loc.screenshot({ path: resolve(out, `v5-sec-${s.id}.png`) });
    const info = await loc.evaluate((el) => {
      const h2 = el.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim();
      const links = [...el.querySelectorAll("a")]
        .map((a) => ({
          text: (a.textContent || "").replace(/\s+/g, " ").trim(),
          href: a.getAttribute("href"),
        }))
        .filter((a) => a.text && a.text.length < 60);
      const buttons = [...el.querySelectorAll("button")].map((b) =>
        (b.textContent || "").replace(/\s+/g, " ").trim(),
      );
      return { h2, links: links.slice(0, 12), buttons: buttons.slice(0, 6) };
    });
    sectionReport.push({ id: s.id, found: true, ...info });
  }

  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, "v5-footer.png") });

  // secondary pages
  for (const path of ["/login", "/docs", "/docs/pricing", "/security", "/blog"]) {
    const id = path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-");
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, `v5-${id}.png`) });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(out, `v5-${id}-bottom.png`) });
  }

  // mobile home + login
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const m = await mctx.newPage();
  await m.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await m.screenshot({ path: resolve(out, "v5m-home.png") });
  await m.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await m.screenshot({ path: resolve(out, "v5m-login.png") });

  // CTA click chain
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const clicks: Record<string, string> = {};
  await page.locator("#fitness").scrollIntoViewIfNeeded();
  const fitnessLinks = await page.locator("#fitness a").allTextContents();
  clicks.fitnessLinks = fitnessLinks.map((t) => t.trim()).join(" | ");
  await page.locator("#projects").scrollIntoViewIfNeeded();
  const projectLinks = await page.locator("#projects a").allTextContents();
  clicks.projectLinks = projectLinks
    .map((t) => t.replace(/\s+/g, " ").trim())
    .slice(0, 8)
    .join(" | ");

  const paid = await page.evaluate(() =>
    /\$99|\$199|Buy Starter|Buy Pro/i.test(document.body.innerText),
  );

  const summary = { sectionReport, clicks, paid };
  writeFileSync(resolve(out, "v5-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
