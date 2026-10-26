import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { isPathAllowed, isSafeRelativePath } from "./path-policy.js";

const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  ".coppergate-sandbox",
]);

export type WorkdirFileSnapshot = Map<string, string>;

function contentHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Snapshot relative file path → content hash under workdir.
 * Skips VCS/build noise; optionally filters to allowedPaths when non-empty.
 */
export async function snapshotWorkdir(
  workdir: string,
  allowedPaths: string[] = [],
): Promise<WorkdirFileSnapshot> {
  const out: WorkdirFileSnapshot = new Map();
  await walk(workdir, workdir, allowedPaths, out);
  return out;
}

async function walk(
  root: string,
  dir: string,
  allowedPaths: string[],
  out: WorkdirFileSnapshot,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      // Skip other dotfiles/dirs except we already handled skip set.
      if (entry.isDirectory()) continue;
    }
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      await walk(root, join(dir, entry.name), allowedPaths, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (!isSafeRelativePath(rel)) continue;
    if (!isPathAllowed(rel, allowedPaths)) continue;
    try {
      const st = await stat(abs);
      if (!st.isFile() || st.size > 2_000_000) continue;
      const body = await readFile(abs, "utf8");
      out.set(rel, contentHash(body));
    } catch {
      // Unreadable / binary — skip
    }
  }
}

export type ChangedWorkdirFile = {
  path: string;
  content: string;
  action: "create" | "modify";
};

/** Files present in `after` that are new or have a different hash than `before`. */
export async function diffWorkdirSnapshots(
  workdir: string,
  before: WorkdirFileSnapshot,
  after: WorkdirFileSnapshot,
): Promise<ChangedWorkdirFile[]> {
  const changed: ChangedWorkdirFile[] = [];
  for (const [rel, hash] of after) {
    const prev = before.get(rel);
    if (prev === hash) continue;
    try {
      const body = await readFile(join(workdir, rel), "utf8");
      changed.push({
        path: rel,
        content: body,
        action: prev === undefined ? "create" : "modify",
      });
    } catch {
      // Deleted between snapshot and read — ignore
    }
  }
  return changed;
}
