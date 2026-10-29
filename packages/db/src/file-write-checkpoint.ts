import { createHash } from "node:crypto";
import type { Database } from "./client.js";
import {
  createArtifact,
  listArtifactsForRun,
  parseArtifactMeta,
} from "./artifacts.js";

/**
 * AG-014 — Mid-run file-write checkpoint.
 * Soft-cancel / abort already stop the LLM; this artifact records successful
 * sandbox writes so lease reclaim can restore them instead of replaying blindly.
 */

export const FILE_WRITE_CHECKPOINT_KIND = "file_write_checkpoint" as const;

/** Cap inline bodies so reclaim restore stays bounded (dogfood PRs). */
export const FILE_WRITE_CHECKPOINT_MAX_BYTES = 512_000;

export type FileWriteCheckpointEntry = {
  path: string;
  /** sha256 hex of utf8 content */
  contentSha256: string;
  /** utf8 body when under size cap; omitted when too large (must rewrite). */
  content?: string;
};

export type FileWriteCheckpointBody = {
  kind: typeof FILE_WRITE_CHECKPOINT_KIND;
  runId: string;
  taskId: string;
  files: FileWriteCheckpointEntry[];
};

export function hashFileWriteContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildFileWriteCheckpointEntry(
  path: string,
  content: string,
): FileWriteCheckpointEntry {
  const contentSha256 = hashFileWriteContent(content);
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > FILE_WRITE_CHECKPOINT_MAX_BYTES) {
    return { path, contentSha256 };
  }
  return { path, contentSha256, content };
}

/** Merge new writes over prior checkpoint (last write wins per path). */
export function mergeFileWriteCheckpoint(
  prior: FileWriteCheckpointBody | null,
  input: {
    runId: string;
    taskId: string;
    writes: Array<{ path: string; content: string }>;
  },
): FileWriteCheckpointBody {
  const byPath = new Map<string, FileWriteCheckpointEntry>();
  for (const f of prior?.files ?? []) {
    if (typeof f.path === "string" && f.path.trim()) {
      byPath.set(f.path, f);
    }
  }
  for (const w of input.writes) {
    if (!w.path.trim()) continue;
    byPath.set(w.path, buildFileWriteCheckpointEntry(w.path, w.content));
  }
  return {
    kind: FILE_WRITE_CHECKPOINT_KIND,
    runId: input.runId,
    taskId: input.taskId,
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function parseFileWriteCheckpoint(
  raw: unknown,
): FileWriteCheckpointBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== FILE_WRITE_CHECKPOINT_KIND) return null;
  if (typeof o.runId !== "string" || typeof o.taskId !== "string") return null;
  if (!Array.isArray(o.files)) return null;
  const files: FileWriteCheckpointEntry[] = [];
  for (const item of o.files) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.path !== "string" || !e.path.trim()) continue;
    if (typeof e.contentSha256 !== "string" || !e.contentSha256) continue;
    const entry: FileWriteCheckpointEntry = {
      path: e.path,
      contentSha256: e.contentSha256,
    };
    if (typeof e.content === "string") entry.content = e.content;
    files.push(entry);
  }
  return {
    kind: FILE_WRITE_CHECKPOINT_KIND,
    runId: o.runId,
    taskId: o.taskId,
    files,
  };
}

/** Paths that reclaim may skip re-applying (have restorable content). */
export function restorableWritePaths(
  checkpoint: FileWriteCheckpointBody | null | undefined,
): string[] {
  if (!checkpoint) return [];
  return checkpoint.files
    .filter((f) => typeof f.content === "string")
    .map((f) => f.path);
}

/**
 * Files to skip on a fresh agent proposal: same path already checkpointed with
 * identical content hash. Different content → allow overwrite.
 */
export function filterProposedWritesAgainstCheckpoint(
  proposed: Array<{ path: string; content: string }>,
  checkpoint: FileWriteCheckpointBody | null | undefined,
): {
  toWrite: Array<{ path: string; content: string }>;
  skipped: string[];
} {
  if (!checkpoint || checkpoint.files.length === 0) {
    return { toWrite: proposed, skipped: [] };
  }
  const byPath = new Map(
    checkpoint.files.map((f) => [f.path, f] as const),
  );
  const toWrite: Array<{ path: string; content: string }> = [];
  const skipped: string[] = [];
  for (const p of proposed) {
    const prior = byPath.get(p.path);
    if (
      prior &&
      prior.contentSha256 === hashFileWriteContent(p.content)
    ) {
      skipped.push(p.path);
      continue;
    }
    toWrite.push(p);
  }
  return { toWrite, skipped };
}

export async function persistFileWriteCheckpoint(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    runId: string;
    checkpoint: FileWriteCheckpointBody;
  },
): Promise<void> {
  await createArtifact(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runId: input.runId,
    kind: FILE_WRITE_CHECKPOINT_KIND,
    body: input.checkpoint,
    meta: {
      fileCount: input.checkpoint.files.length,
      paths: input.checkpoint.files.map((f) => f.path).slice(0, 40),
    },
  });
}

export async function getFileWriteCheckpoint(
  db: Database,
  workspaceId: string,
  runId: string,
): Promise<FileWriteCheckpointBody | null> {
  const rows = await listArtifactsForRun(db, workspaceId, runId);
  const ordered = [...rows]
    .filter((r) => r.kind === FILE_WRITE_CHECKPOINT_KIND)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const row of ordered) {
    const meta = parseArtifactMeta(row);
    let body: unknown = meta;
    if (typeof meta.inlineBody === "string") {
      try {
        body = JSON.parse(meta.inlineBody);
      } catch {
        body = meta;
      }
    }
    const parsed = parseFileWriteCheckpoint(body);
    if (parsed) return parsed;
  }
  return null;
}
