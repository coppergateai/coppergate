/**
 * Append Open Program rows to the project-bound architecture markdown (AG-037).
 * Uses project architectureRepo/paths — not env-only Done writeback.
 */
import type { OpenProgramRowAppend } from "@coppergate/db";
import { appendBugScoutOpenRowsToMarkdown } from "@coppergate/db";
import { getRepoFile, updateRepoFile } from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

export async function appendArchitectureOpenRows(
  log: Logger,
  input: {
    token: string;
    architectureRepo: string;
    architecturePaths: string;
    rows: OpenProgramRowAppend[];
    /** Prefer first path that already has content; default first path. */
    allowDefaultBranchWrite?: boolean;
  },
): Promise<{ path: string; ids: string[] } | null> {
  if (input.rows.length === 0) return null;

  const [owner, name] = input.architectureRepo.split("/");
  if (!owner || !name) return null;

  const paths = input.architecturePaths
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (paths.length === 0) return null;

  const allowDefaultBranchWrite = input.allowDefaultBranchWrite !== false;
  const ids = input.rows.map((r) => r.id).join(", ");

  for (const path of paths) {
    try {
      const file = await getRepoFile({
        token: input.token,
        owner,
        repo: name,
        path,
      });
      if (!file) continue;

      const { content, changed } = appendBugScoutOpenRowsToMarkdown(
        file.content,
        input.rows,
      );
      if (!changed) continue;

      await updateRepoFile({
        token: input.token,
        owner,
        repo: name,
        path,
        content,
        sha: file.sha,
        message: `chore(architecture): bug-scout open ${ids}`,
        allowDefaultBranchWrite,
      });
      log.info("architecture open append", { path, ids: input.rows.map((r) => r.id) });
      return { path, ids: input.rows.map((r) => r.id) };
    } catch (err) {
      log.warn("architecture open append failed", {
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
