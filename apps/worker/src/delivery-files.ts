import { readFile } from "node:fs/promises";
import { resolveContainedPath } from "@coppergate/sandbox";

export type DeliveryFile = { path: string; content: string };

const README_NAMES = new Set(["readme.md", "readme.txt", "readme"]);

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
