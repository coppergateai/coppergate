import {
  evaluateAgentWritePath,
  isForbiddenAgentPath,
} from "@coppergate/agents";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolveContainedPath } from "@coppergate/sandbox";

export type DeliveryFile = { path: string; content: string };

const README_NAMES = new Set(["readme.md", "readme.txt", "readme"]);

/** Go phantom trees agents invent beside a TypeScript monorepo. */
const PHANTOM_GO_PREFIXES = [
  "arena/",
  "internal/",
  "roster/",
  "spend/",
  "runtime/",
  "pkg/",
];

/**
 * Glob-ish allowlist match (`apps/**`, `*.md`, exact path).
 * Empty allowlist = allow all.
 */
export function pathMatchesAllowlist(
  path: string,
  allowlist: string[],
): boolean {
  if (!allowlist.length) return true;
  const p = path.replace(/^\.\//, "");
  for (const raw of allowlist) {
    const allow = raw.trim();
    if (!allow || allow === "**" || allow === "**/*") return true;
    if (allow.endsWith("/**")) {
      const prefix = allow.slice(0, -3);
      if (p === prefix || p.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)) {
        return true;
      }
      continue;
    }
    if (allow.startsWith("*.")) {
      if (p.toLowerCase().endsWith(allow.slice(1).toLowerCase())) return true;
      continue;
    }
    if (p === allow || p.startsWith(`${allow}/`)) return true;
  }
  return false;
}

/**
 * Refuse deliveries that only touch phantom Go trees when the task/policy
 * allowlist is product-oriented (apps/packages/docs), or when every path is
 * outside the allowlist.
 */
export function assertProductDeliveryPaths(input: {
  paths: string[];
  pathAllowlist: string[];
}): { ok: true } | { ok: false; reason: string; code: string } {
  const paths = input.paths
    .map((p) => p.replace(/^\.\//, "").trim())
    .filter(Boolean);
  if (paths.length === 0) {
    return { ok: false, reason: "no_delivery_paths", code: "no_sandbox_files" };
  }

  const allPhantomGo = paths.every(
    (p) =>
      p.endsWith(".go") &&
      PHANTOM_GO_PREFIXES.some((pre) => p.startsWith(pre)),
  );
  if (allPhantomGo) {
    return {
      ok: false,
      reason: "phantom_go_tree",
      code: "phantom_tree",
    };
  }

  const allow = input.pathAllowlist.filter((p) => p.trim());
  if (allow.length > 0) {
    const allowed = paths.filter((p) => pathMatchesAllowlist(p, allow));
    if (allowed.length === 0) {
      return {
        ok: false,
        reason: `paths outside allowlist: ${paths.slice(0, 8).join(", ")}`,
        code: "path_not_allowed",
      };
    }
  }

  const forbidden = paths.filter((p) => isForbiddenAgentPath(p));
  if (forbidden.length > 0) {
    return {
      ok: false,
      reason: `forbidden agent paths: ${forbidden.slice(0, 8).join(", ")}`,
      code: "forbidden_path",
    };
  }

  return { ok: true };
}

const PACKAGE_MANIFEST_RE = /(^|\/)package\.json$/i;
const PNPM_LOCK_RE = /(^|\/)pnpm-lock\.yaml$/i;
const NPM_LOCK_RE = /(^|\/)package-lock\.json$/i;
const YARN_LOCK_RE = /(^|\/)yarn\.lock$/i;

const ROOT_LOCKFILE_CANDIDATES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
] as const;

export type LockfilePackageManager = "pnpm" | "npm" | "yarn";

function touchesLockfilePath(paths: string[]): boolean {
  return (
    paths.some((p) => PNPM_LOCK_RE.test(p)) ||
    paths.some((p) => NPM_LOCK_RE.test(p)) ||
    paths.some((p) => YARN_LOCK_RE.test(p))
  );
}

/**
 * Refuse live delivery when package.json changes without a lockfile update.
 * Prevents CI frozen-lockfile failures (ACPP dogfood P-011 class).
 */
export function assertLockfileSyncedWithPackageJson(
  paths: string[],
): { ok: true } | { ok: false; reason: string; code: string } {
  const normalized = paths
    .map((p) => p.replace(/^\.\//, "").trim())
    .filter(Boolean);
  const touchesPackageJson = normalized.some((p) => PACKAGE_MANIFEST_RE.test(p));
  if (!touchesPackageJson) return { ok: true };

  if (touchesLockfilePath(normalized)) return { ok: true };

  return {
    ok: false,
    reason:
      "package.json changed without pnpm-lock.yaml / package-lock.json / yarn.lock — run the package manager to refresh the lockfile before delivery",
    code: "lockfile_out_of_sync",
  };
}

async function pathExistsInWorkdir(
  workdir: string,
  relPath: string,
): Promise<boolean> {
  try {
    const abs = resolveContainedPath(workdir, relPath);
    await access(abs, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * When agents edit package.json but omit the lockfile from filesChanged,
 * include an on-disk root lockfile so delivery stays CI-frozen-lockfile safe.
 */
export async function findOnDiskLockfilePaths(
  workdir: string | null | undefined,
  paths: string[],
): Promise<string[]> {
  const normalized = paths
    .map((p) => p.replace(/^\.\//, "").trim())
    .filter(Boolean);
  if (!normalized.some((p) => PACKAGE_MANIFEST_RE.test(p))) return [];
  if (touchesLockfilePath(normalized)) return [];
  const root = workdir?.trim();
  if (!root) return [];

  const found: string[] = [];
  for (const candidate of ROOT_LOCKFILE_CANDIDATES) {
    if (await pathExistsInWorkdir(root, candidate)) {
      found.push(candidate);
    }
  }
  return found;
}

/** Prefer the lockfile already on disk; default pnpm for JS monorepos. */
export async function detectLockfilePackageManager(
  workdir: string | null | undefined,
): Promise<LockfilePackageManager> {
  const root = workdir?.trim();
  if (!root) return "pnpm";
  if (await pathExistsInWorkdir(root, "pnpm-lock.yaml")) return "pnpm";
  if (await pathExistsInWorkdir(root, "yarn.lock")) return "yarn";
  if (await pathExistsInWorkdir(root, "package-lock.json")) return "npm";
  return "pnpm";
}

/** argv for refreshing the lockfile after package.json edits (no shell -c). */
export function lockfileRefreshCommand(
  pm: LockfilePackageManager,
): string[] {
  if (pm === "yarn") return ["yarn", "install", "--mode=update-lockfile"];
  if (pm === "npm") return ["npm", "install", "--package-lock-only", "--ignore-scripts"];
  return ["pnpm", "install", "--lockfile-only", "--ignore-scripts"];
}

/** Root lockfile path expected after a refresh for the given package manager. */
export function lockfilePathForPackageManager(
  pm: LockfilePackageManager,
): string {
  if (pm === "yarn") return "yarn.lock";
  if (pm === "npm") return "package-lock.json";
  return "pnpm-lock.yaml";
}

/** SEC-022 — refuse delivery file bodies that embed tokens or private keys. */
export function assertDeliverySecretsRefused(
  files: DeliveryFile[],
): { ok: true } | { ok: false; reason: string; code: string } {
  for (const file of files) {
    const gate = evaluateAgentWritePath({
      path: file.path,
      allowedPaths: ["**/*"],
      content: file.content,
    });
    if (!gate.ok && gate.code === "forbidden_secret") {
      return {
        ok: false,
        reason: gate.message,
        code: "forbidden_secret",
      };
    }
  }
  return { ok: true };
}

/**
 * Prefer sandbox workdir contents for paths the agent reported.
 * Never invent README stubs or smoke pages — empty means no delivery.
 * Paths are resolved inside workdir only (no traversal).
 */
export async function buildDeliveryFiles(input: {
  workdir: string | null | undefined;
  filesChanged: string[];
  runId: string;
}): Promise<{ files: DeliveryFile[]; fromSandbox: number }> {
  const paths = (
    input.filesChanged.length > 0 ? input.filesChanged : []
  ).filter((p) => typeof p === "string" && p.trim() && !p.includes("*"));

  const unique = [...new Set(paths.map((p) => p.replace(/^\.\//, "")))];
  const files: DeliveryFile[] = [];
  let fromSandbox = 0;
  const workdir = input.workdir?.trim() || null;

  for (const path of unique) {
    if (README_NAMES.has(path.toLowerCase())) {
      if (!workdir) continue;
      try {
        const abs = resolveContainedPath(workdir, path);
        const content = await readFile(abs, "utf8");
        files.push({ path, content });
        fromSandbox += 1;
      } catch {
        /* skip — do not stub-overwrite README / refuse traversal */
      }
      continue;
    }

    if (!workdir) continue;
    try {
      const abs = resolveContainedPath(workdir, path);
      const content = await readFile(abs, "utf8");
      files.push({ path, content });
      fromSandbox += 1;
    } catch {
      /* skip missing paths or path escape — never invent stub content */
    }
  }

  return { files, fromSandbox };
}
