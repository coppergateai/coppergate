/**
 * Mark architecture Open IDs Done after they ship.
 * - writeArchitectureTaskDone: immediately after a maintainer auto-merge.
 * - reconcileArchitectureDone: periodic sweep that also covers human merges
 *   and earlier writebacks that failed.
 * Both write to the project-bound Open Program (same binding replan reads).
 */
import {
  extractArchitectureIdFromTitle,
  listMergedArchitectureIds,
  markArchitectureIdDoneInMarkdown,
  resolveArchitectureBinding,
} from "@coppergate/db";
import { getRepoFile, updateRepoFile } from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

type ArchitectureBindingInput = {
  /** Project MaintainerPolicy.architectureRepo (falls back to env). */
  architectureRepo?: string | null;
  /** Project MaintainerPolicy.architecturePaths (falls back to env). */
  architecturePaths?: string | null;
};

/** Flip every Open row for `ids`; one commit for the first path that changes. */
async function markIdsDone(
  log: Logger,
  input: ArchitectureBindingInput & {
    token: string;
    ids: string[];
    message: (flipped: string[]) => string;
  },
): Promise<{ ids: string[]; path: string } | null> {
  const binding = resolveArchitectureBinding({
    repo: input.architectureRepo,
    paths: input.architecturePaths,
  });
  if (!binding) {
    log.warn("architecture writeback skipped — binding misconfigured", {
      ids: input.ids,
    });
    return null;
  }

  let sawFile = false;
  for (const path of binding.paths) {
    try {
      const file = await getRepoFile({
        token: input.token,
        owner: binding.owner,
        repo: binding.name,
        path,
      });
      if (!file) continue;
      sawFile = true;
      let content = file.content;
      const flipped: string[] = [];
      for (const id of input.ids) {
        const res = markArchitectureIdDoneInMarkdown(content, id);
        if (res.changed) {
          content = res.content;
          flipped.push(id);
        }
      }
      if (flipped.length === 0) continue;
      await updateRepoFile({
        token: input.token,
        owner: binding.owner,
        repo: binding.name,
        path,
        content,
        sha: file.sha,
        message: input.message(flipped),
        allowDefaultBranchWrite: true,
      });
      log.info("architecture writeback", {
        ids: flipped,
        repo: binding.repo,
        path,
      });
      return { ids: flipped, path };
    } catch (err) {
      log.warn("architecture writeback failed", {
        ids: input.ids,
        repo: binding.repo,
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (!sawFile) {
    log.warn("architecture writeback found no program file", {
      ids: input.ids,
      repo: binding.repo,
      paths: binding.paths,
    });
  }
  return null;
}

export async function writeArchitectureTaskDone(
  log: Logger,
  input: ArchitectureBindingInput & {
    token: string;
    taskTitle: string;
    prNumber: number;
  },
): Promise<{ id: string; path: string } | null> {
  const id = extractArchitectureIdFromTitle(input.taskTitle);
  if (!id) return null;
  const res = await markIdsDone(log, {
    token: input.token,
    architectureRepo: input.architectureRepo,
    architecturePaths: input.architecturePaths,
    ids: [id],
    message: (flipped) =>
      `chore(architecture): mark ${flipped.join(", ")} Done (merged PR #${input.prNumber})`,
  });
  return res ? { id, path: res.path } : null;
}

/**
 * Mark Done every Open ID cited by a merged PR on the product repo's default
 * branch. Rows already Done are left untouched, so this is safe every tick.
 */
export async function reconcileArchitectureDone(
  log: Logger,
  input: ArchitectureBindingInput & {
    token: string;
    owner: string;
    repo: string;
    listMerged?: typeof listMergedArchitectureIds;
  },
): Promise<{ ids: string[]; path: string } | null> {
  const listMerged = input.listMerged ?? listMergedArchitectureIds;
  const merged = await listMerged({
    token: input.token,
    owner: input.owner,
    repo: input.repo,
  });
  if (merged.size === 0) return null;
  return markIdsDone(log, {
    token: input.token,
    architectureRepo: input.architectureRepo,
    architecturePaths: input.architecturePaths,
    ids: [...merged.keys()],
    message: (flipped) =>
      `chore(architecture): mark ${flipped.join(", ")} Done (merged ${flipped
        .map((id) => `${input.owner}/${input.repo}#${merged.get(id)}`)
        .join(", ")})`,
  });
}
