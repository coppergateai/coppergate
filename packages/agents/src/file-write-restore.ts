import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveSafeWorkdirPath } from "./path-policy.js";

/** AG-014 — re-apply restorable checkpoint bodies into a fresh sandbox. */

export type RestorableWrite = {
  path: string;
  content: string;
};

export async function restoreFileWritesToWorkdir(
  workdir: string,
  files: RestorableWrite[],
): Promise<{ restored: string[]; skipped: string[] }> {
  const restored: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (typeof f.content !== "string") {
      skipped.push(f.path);
      continue;
    }
    const abs = resolveSafeWorkdirPath(workdir, f.path);
    if (!abs) {
      skipped.push(f.path);
      continue;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, f.content, "utf8");
    restored.push(f.path);
  }
  return { restored, skipped };
}
