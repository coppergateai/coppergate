import { createHash } from "node:crypto";

/** AG-014 — skip sandbox writes already restored from a file_write_checkpoint. */

export type CompletedWriteFingerprint = {
  path: string;
  contentSha256: string;
};

export function sha256Utf8(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function filterProposedWritesAgainstCompleted(
  proposed: Array<{ path: string; content: string }>,
  completed: CompletedWriteFingerprint[] | undefined,
): {
  toWrite: Array<{ path: string; content: string }>;
  skipped: string[];
} {
  if (!completed || completed.length === 0) {
    return { toWrite: proposed, skipped: [] };
  }
  const byPath = new Map(completed.map((c) => [c.path, c.contentSha256]));
  const toWrite: Array<{ path: string; content: string }> = [];
  const skipped: string[] = [];
  for (const p of proposed) {
    const priorSha = byPath.get(p.path);
    if (priorSha && priorSha === sha256Utf8(p.content)) {
      skipped.push(p.path);
      continue;
    }
    toWrite.push(p);
  }
  return { toWrite, skipped };
}
