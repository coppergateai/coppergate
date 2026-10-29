# SEC-036 — Prod / default-branch write policy gate

PRODUCT §4 #8 / ARENA: Coppergate refuses **merge-to-default**, **GitHub Release**, **default-branch Contents writes**, and **production deploy commands** unless you set an explicit policy flag first.

## Flags (fail closed)

| Action | Required flag | Where you enable it |
| --- | --- | --- |
| Merge PR → default branch (Accept path) | `mergeEnabled` + autonomy **L2** | Project → Merge after accept |
| Merge PR → default branch (Maintainer tick) | `mergeEnabled` + maintainer **autoMerge** | Maintainer policy + merge toggle |
| GitHub tag + Release (L3 assistant) | `autoRelease` | Maintainer policy |
| Direct commit to default branch (Contents API) | Matching explicit flag for that path (e.g. design scout, post-merge writeback) | Maintainer / internal path only |
| `fly deploy`, `kubectl apply`, etc. in sandbox | `prod_writes_enabled` on Arena | Arena settings (off by default) |

Delivery to **feature branches** (PR delivery) was already blocked from pushing the default branch via `assertSafeBranch`; SEC-036 adds the merge/release/deploy gates above.

## Implementation

- Core helpers: `packages/scm/src/prod-write-policy.ts`
- GitHub API: `mergePullRequest`, `createGithubRelease`, `updateRepoFile`, `putRepoBinaryFile`
- Sandbox: `assertSandboxCommandArgs` + arena `prodWritesEnabled` on sandbox create

## Tests

- `packages/scm/src/prod-write-policy.test.ts`
- `packages/github/src/issues.test.ts`, `release.test.ts`
- `packages/sandbox/src/command-policy.test.ts`
- `scripts/assert-sec036-prod-write-policy.mjs`
