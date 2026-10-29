/**
 * Mark architecture Open IDs Done after a successful auto-merge.
 */
import {
  extractArchitectureIdFromTitle,
  markArchitectureIdDoneInMarkdown,
  DEFAULT_ARCHITECTURE_PATHS,
} from "@coppergate/db";
import { getRepoFile, updateRepoFile } from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

export async function writeArchitectureTaskDone(
  log: Logger,
  input: {
    token: string;
    taskTitle: string;
    prNumber: number;
  },
): Promise<{ id: string; path: string } | null> {
  const id = extractArchitectureIdFromTitle(input.taskTitle);
  if (!id) return null;

  const repo =
    process.env.ARCHITECTURE_REPO?.trim() || "kprompt/kprompt-architecture";
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;

  const paths = (
    process.env.ARCHITECTURE_PATHS?.trim() || DEFAULT_ARCHITECTURE_PATHS
  )
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const path of paths) {
    try {
      const file = await getRepoFile({
        token: input.token,
        owner,
        repo: name,
        path,
      });
      if (!file) continue;
      const { content, changed } = markArchitectureIdDoneInMarkdown(
        file.content,
        id,
      );
      if (!changed) continue;
      await updateRepoFile({
        token: input.token,
        owner,
        repo: name,
        path,
        content,
        sha: file.sha,
        message: `chore(architecture): mark ${id} Done (merged PR #${input.prNumber})`,
        allowDefaultBranchWrite: true,
      });
      log.info("architecture writeback", { id, path, prNumber: input.prNumber });
      return { id, path };
    } catch (err) {
      log.warn("architecture writeback failed", {
        id,
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
