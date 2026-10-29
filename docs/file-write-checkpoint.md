# Mid-run file-write checkpoint (AG-014)

Soft-cancel (`cancelRequestedAt` + `abortSignal`) already stops in-flight LLM calls, and expired soft-cancel leases hard-cancel instead of requeueing. **AG-014** covers the remaining reclaim case: a RUNNING lease is lost mid-write and the worker claims the same run again.

## Problem

Without a durable step checkpoint, reclaim starts a fresh sandbox and the coding harness can **replay** the same file writes. That wastes spend and can thrash files that already succeeded before the abort.

## Contract

| Step | Behavior |
| --- | --- |
| After each sandbox `file` write | Persist artifact `file_write_checkpoint` with path + sha256 (+ utf8 body when under 512KB) |
| On execute start | Load latest checkpoint for the run; restore bodies into the sandbox; pass fingerprints as `completedWritePaths` |
| OpenAI-compatible apply | Skip proposed writes whose path+sha match the checkpoint (`file_write_checkpoint_skip`) |

## Non-goals

- Does not replace delivery_checkpoint (post-PR)
- Cursor / Claude Code sessions still own their own tool loops; restore still seeds the workdir for all harnesses
- Oversized files store sha only (must rewrite on reclaim)

## Evidence

- `packages/db/src/file-write-checkpoint.test.ts`
- `packages/agents/src/file-write-skip.test.ts`
