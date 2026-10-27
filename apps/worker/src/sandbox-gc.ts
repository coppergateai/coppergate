import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "@coppergate/telemetry";

const SANDBOX_PREFIXES = ["cg-sandbox-", "cg-sandbox-docker-"];

/**
 * Remove orphaned sandbox workdirs left after crash / ENOSPC.
 * Only deletes directories under os.tmpdir() matching Coppergate prefixes
 * that are older than minAgeMs (default 30m).
 */
export async function gcOrphanSandboxes(input?: {
  rootDir?: string;
  minAgeMs?: number;
  log?: Logger;
}): Promise<{ removed: number; errors: number }> {
  const root = input?.rootDir ?? tmpdir();
  const minAgeMs = input?.minAgeMs ?? 30 * 60_000;
  const log = input?.log;
  let removed = 0;
  let errors = 0;
  const now = Date.now();

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    log?.warn("sandbox gc: cannot read tmp", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { removed: 0, errors: 1 };
  }

  for (const name of entries) {
    if (!SANDBOX_PREFIXES.some((p) => name.startsWith(p))) continue;
    const full = join(root, name);
    try {
      const st = await stat(full);
      if (!st.isDirectory()) continue;
      const age = now - st.mtimeMs;
      if (age < minAgeMs) continue;
      await rm(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      errors += 1;
    }
  }

  if (removed > 0 || errors > 0) {
    log?.info("sandbox gc finished", { removed, errors, root });
  }
  return { removed, errors };
}
