# Kprompt dogfood

Operator path: consolidate the Kprompt workspace into **one primary project + ≤5 secondaries**, then land the first **issue → verified PR** on the primary.

## Constraints

- Max **5** secondary repos (policy hard-cap).
- Writes stay on **primary**; secondaries are read context. Keep **coordinated PRs off** for the first PR.
- SETUP in UI means no approved brief — approve a brief to leave Setup.

## Repo map

| Role | Repo |
|---|---|
| Primary | `kprompt/kprompt` (project name `kprompt`) |
| Secondary | `kprompt-app`, `kprompt-api`, `kprompt-website`, `kprompt-dash`, `kprompt-admin` |
| Archive only (no re-attach) | `.github`, `homebrew-tap`, `kprompt-examples`, `kprompt-architecture` |

## Steps

### 1. Consolidate (dry-run first)

```bash
cd coppergate
set -a && source .env && set +a

# Inspect
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-consolidate-repos.mjs --dry-run

# Apply (archives siblings, unbinds, enables multi-repo, attaches secondaries)
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-consolidate-repos.mjs
```

Optional: `--workspace-id UUID` · `--primary-name kprompt` · `--secondary-repos a,b,c`

### 2. Ready + arena

```bash
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-ready-arena.mjs
```

Sets ~$50 project budget, creates+approves a tiny brief, arms Survivor arena (N=2).

### 3. First survivor PR

```bash
# Creates a tiny GitHub issue (or pass ISSUE_NUMBER), imports, queues (needs L1+)
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-first-pr.mjs

# Worker must be running:
#   GITHUB_DELIVERY_MODE=http + BYOK or CONTENDER_HARNESS=openhands
```

Then in product: open the task → review survivor PR (diff, CI, cost) → **Accept**.

**UI alternative:** Issues → **Import → queue**. **More → Repositories** verifies primary/secondaries; **Agents** shows the arena.

### 4. Learning loop

If secondary context is useless after the first PR, harden worker secondary tree fetch under `maxSecondaryFiles`. Do not enable coordinated PRs until the primary path is stable.

## Acceptance

- [x] One live `kprompt` project with 1 primary + ≤5 secondaries; siblings archived (2026-10-18 script)
- [x] Brief present (not Setup); arena ARMED (`dogfood-ready-arena.mjs`)
- [x] Issue #208 imported → task queued → REVIEW_REQUIRED with PR (first dogfood run wrongly opened [PR on kprompt-website](https://github.com/kprompt/kprompt-website/pull/19) via unfiltered multi-repo join; delivery now asserts `repoRole=primary`)
- [ ] Accept → DONE after CI green on a primary-targeted PR
