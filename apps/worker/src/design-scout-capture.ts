/**
 * Headless capture for design scout. Soft-fails when Playwright/Chromium missing.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  DesignScoutRoute,
  DesignShot,
  DesignShotMetrics,
} from "@coppergate/db";

export type DesignCaptureResult =
  | { ok: true; shots: DesignShot[]; skippedAuthRoutes: number }
  | { ok: false; reason: "no_browser" | "capture_error"; error?: string };

async function materializeStorageState(): Promise<{
  storageState?: string;
  cleanup: () => Promise<void>;
}> {
  const raw = process.env.DESIGN_SCOUT_STORAGE_STATE?.trim();
  if (!raw) return { cleanup: async () => {} };

  if (raw.startsWith("{") || raw.startsWith("[")) {
    const dir = await mkdtemp(path.join(tmpdir(), "cg-design-scout-"));
    const file = path.join(dir, "storage.json");
    await writeFile(file, raw, "utf8");
    return {
      storageState: file,
      cleanup: async () => {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      },
    };
  }
  return { storageState: raw, cleanup: async () => {} };
}

const METRICS_JS = `(() => {
  const main = document.querySelector("main");
  const client = document.documentElement.clientWidth;
  const scrollW = document.documentElement.scrollWidth;
  const mainW = main ? Math.round(main.getBoundingClientRect().width) : 0;
  const overflowRight = [];
  for (const el of document.querySelectorAll("main *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 40 && r.right > client + 2) {
      overflowRight.push({
        cls: String(el.className || "").slice(0, 60),
        right: Math.round(r.right),
      });
      if (overflowRight.length >= 5) break;
    }
  }
  return {
    client,
    scrollW,
    hScroll: scrollW > client + 1,
    mainW,
    overflowRight,
    title: document.title,
  };
})()`;

export async function captureDesignScoutShots(input: {
  baseUrl: string;
  routes: DesignScoutRoute[];
}): Promise<DesignCaptureResult> {
  let chromium: typeof import("@playwright/test").chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch (err) {
    return {
      ok: false,
      reason: "no_browser",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const auth = await materializeStorageState();
  const outDir = await mkdtemp(path.join(tmpdir(), "cg-design-shots-"));
  const shots: DesignShot[] = [];
  let skippedAuthRoutes = 0;

  try {
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.PW_USE_BUNDLED === "1" ? undefined : "chrome",
    });
    try {
      const context = await browser.newContext({
        ...(auth.storageState ? { storageState: auth.storageState } : {}),
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript(
        `try { localStorage.setItem("cg-theme", "light"); } catch (e) {}`,
      );
      const page = await context.newPage();
      const root = input.baseUrl.replace(/\/$/, "");

      for (const route of input.routes) {
        if (route.requiresAuth && !auth.storageState) {
          skippedAuthRoutes += 1;
          continue;
        }
        const url = `${root}${route.path.startsWith("/") ? route.path : `/${route.path}`}`;
        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          if (route.requiresAuth && page.url().includes("/login")) {
            skippedAuthRoutes += 1;
            continue;
          }
          await page.evaluate(`(() => {
            localStorage.setItem("cg-theme","light");
            document.documentElement.setAttribute("data-theme","light");
            document.documentElement.style.colorScheme="light";
          })()`);
          if (route.ready) {
            await page
              .getByText(route.ready)
              .first()
              .waitFor({ timeout: 15_000 })
              .catch(() => null);
          }
          for (let i = 0; i < 12; i++) {
            const n = await page.locator("[class*='skeleton' i]").count();
            if (n === 0) break;
            await page.waitForTimeout(200);
          }
          await page.waitForTimeout(400);

          const metrics = (await page.evaluate(
            METRICS_JS,
          )) as DesignShotMetrics;
          const pngPath = path.join(outDir, `${route.name}.png`);
          await page.screenshot({ path: pngPath, fullPage: false });
          const pngBytes = await readFile(pngPath);
          shots.push({
            name: route.name,
            url: page.url(),
            path: route.path,
            metrics,
            pngPath,
            pngBytes,
          });
        } catch {
          // Skip individual route failures; continue the tour.
        }
      }

      await context.close();
    } finally {
      await browser.close();
    }
  } catch (err) {
    await auth.cleanup();
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
    return {
      ok: false,
      reason: "no_browser",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await auth.cleanup();
  await rm(outDir, { recursive: true, force: true }).catch(() => {});
  return { ok: true, shots, skippedAuthRoutes };
}
