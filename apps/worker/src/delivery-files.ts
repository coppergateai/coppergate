import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type DeliveryFile = { path: string; content: string };

const README_NAMES = new Set(["readme.md", "readme.txt", "readme"]);

/**
 * Prefer sandbox workdir contents for paths the agent reported.
 * Never invent README stubs that overwrite a real repo README.
 */
export async function buildDeliveryFiles(input: {
  workdir: string | null | undefined;
  filesChanged: string[];
  runId: string;
}): Promise<{ files: DeliveryFile[]; fromSandbox: number }> {
  const paths = (
    input.filesChanged.length > 0 ? input.filesChanged : ["app/page.tsx"]
  ).filter((p) => typeof p === "string" && p.trim() && !p.includes("*"));

  const unique = [...new Set(paths.map((p) => p.replace(/^\.\//, "")))];
  const files: DeliveryFile[] = [];
  let fromSandbox = 0;
  const workdir = input.workdir?.trim() || null;

  for (const path of unique) {
    if (README_NAMES.has(path.toLowerCase())) {
      // Only include README if it exists in the sandbox (agent intentionally wrote it).
      if (!workdir) continue;
      try {
        const content = await readFile(join(workdir, path), "utf8");
        files.push({ path, content });
        fromSandbox += 1;
      } catch {
        /* skip — do not stub-overwrite README */
      }
      continue;
    }

    if (workdir) {
      try {
        const content = await readFile(join(workdir, path), "utf8");
        files.push({ path, content });
        fromSandbox += 1;
        continue;
      } catch {
        /* fall through to stub */
      }
    }

    files.push({
      path,
      content: `// coppergate run ${input.runId}\n`,
    });
  }

  if (files.length === 0) {
    files.push({
      path: "app/page.tsx",
      content: [
        `// coppergate run ${input.runId}`,
        `export default function Page() {`,
        `  return <main>Coppergate staging smoke</main>;`,
        `}`,
        ``,
      ].join("\n"),
    });
  }

  return { files, fromSandbox };
}
