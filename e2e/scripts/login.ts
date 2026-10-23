/**
 * Interactive login for hosted Coppergate.
 *
 * 1. Opens Chromium (headed)
 * 2. You complete GitHub/GitLab sign-in
 * 3. Script saves cookies to e2e/.auth/user.json
 * 4. Runs discover-project to write CG_PROJECT_URL
 *
 * Usage: pnpm e2e:login
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { authStatePath, baseUrl, loadE2eEnv } from "../helpers/env.js";

loadE2eEnv();

const AUTH_DIR = resolve(import.meta.dirname, "../.auth");

async function main(): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });
  const url = baseUrl();

  console.log(`\nCoppergate hosted login`);
  console.log(`Base: ${url}`);
  console.log(`\n1) Browser açılacak — GitHub/GitLab ile giriş yap.`);
  console.log(`2) Ana sayfaya dönünce oturum otomatik kaydedilir.\n`);

  const browser = await chromium.launch({
    headless: false,
    channel: (process.env.PW_CHANNEL as "chrome" | undefined) ?? "chrome",
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${url}/login`, { waitUntil: "domcontentloaded" });

  const deadline = Date.now() + 5 * 60_000;
  let current = page.url();
  console.log("Giriş bekleniyor (max 5 dk)…");

  const origin = new URL(url).origin;

  while (Date.now() < deadline) {
    current = page.url();
    // OAuth callback lands on APP_URL "/" — not necessarily /workspaces.
    if (current.startsWith(origin) && !current.includes("/login")) {
      await page.waitForTimeout(1500);
      current = page.url();
      if (current.startsWith(origin) && !current.includes("/login")) break;
    }
    await page.waitForTimeout(500);
  }

  console.log(`Current URL: ${current}`);

  if (!current.startsWith(origin) || current.includes("/login")) {
    console.error(
      current.includes("/login")
        ? "Hâlâ /login — GitHub ile giriş yapıp tekrar dene."
        : "Login timeout (5 dk) veya Coppergate dışındasın.",
    );
    await browser.close();
    process.exit(1);
  }

  const statePath = authStatePath();
  await context.storageState({ path: statePath });
  console.log(`Saved auth → ${statePath}`);

  await browser.close();

  console.log("Proje keşfi…");
  const alt = spawnSync("pnpm", ["exec", "tsx", "scripts/discover-project.ts"], {
    stdio: "inherit",
    cwd: resolve(import.meta.dirname, ".."),
    env: process.env,
  });
  if (alt.status !== 0) {
    console.log(
      "Proje URL otomatik bulunamadı. Çalıştır: pnpm e2e:discover",
    );
  }

  console.log("\nSonraki adım: pnpm e2e:check\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
