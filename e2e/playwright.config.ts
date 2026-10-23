import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv(resolve(import.meta.dirname, ".env"));

const baseURL = process.env.BASE_URL ?? "https://www.coppergate.ai";
const authFile = resolve(import.meta.dirname, ".auth/user.json");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["./reporters/summary-reporter.ts"],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // Prefer system Chrome (OAuth + avoids sandbox browser path mismatch).
    // Set PW_CHANNEL= to empty and use bundled: `PW_CHANNEL= pnpm e2e:check`
    // or `PW_USE_BUNDLED=1`.
    ...(process.env.PW_USE_BUNDLED === "1"
      ? {}
      : { channel: (process.env.PW_CHANNEL as "chrome" | undefined) ?? "chrome" }),
  },
  projects: [
    {
      name: "hosted",
      use: {
        storageState: existsSync(authFile) ? authFile : undefined,
      },
    },
  ],
});

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
