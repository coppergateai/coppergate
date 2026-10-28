# L3 Release Assistant (P-144)

Under **maintainer policy**, Coppergate can open a **GitHub tag + Release** after an unattended merge cycle — not a production deploy.

## When it runs

| Gate | Required |
| --- | --- |
| Maintainer mode | On |
| Policy **auto-release** | On (default **off**) |
| Same maintainer tick | At least one PR merged via auto-merge |

Tag style comes from policy: `daily` (`maintainer-YYYY-MM-DD`) or `semver_patch` (`v0.YYYYMMDD.N`).

Release notes are built from merged task/PR titles (features / fixes / other buckets) via `@coppergate/github` `formatReleaseNotes`.

## Not production deploy

- **Arena `prod_writes_enabled`** stays off unless you explicitly enable it elsewhere; maintainer enable audits `prodWritesEnabled` and `autoRelease` on `maintainer.enable`.
- Auto-release creates a **GitHub Release** only — no Fly/hosted prod rollout.
- PRODUCT §11 non-goals still apply; see `docs/EXPAND_PULL.md`.

## Audit

Each successful release (including idempotent “already exists”) records:

- Activity action **`maintainer.release`** with tag, URL, style, merge highlights, and `prodDeploy: false`
- Maintainer event kind **`release`** with the same payload

## UI honesty

Maintainer panel copy uses `describeReleaseAssistantHonesty` (kept in sync with `@coppergate/db`).

## Tests

- `packages/db/src/maintainer.test.ts` — `shouldRunMaintainerRelease`, default `autoRelease: false`
- `packages/db/src/project-settings-honesty.test.ts` — release assistant copy
- `packages/github/src/release.test.ts` — `createGithubRelease`, `buildMaintainerReleaseRequest`
