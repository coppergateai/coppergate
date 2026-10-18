# Kprompt dogfood

Operator path: consolidate the Kprompt workspace into **one primary project + ≤5 secondaries**, land the first **issue → verified PR** on the primary, then flip the project into **fully autonomous maintainer mode** ($5/mo template).

kprompt is one dogfood **instance** — the same maintainer control plane applies to any project.

## Constraints

- Max **5** secondary repos (policy hard-cap).
- Writes stay on **primary** until coordinated multi-repo is enabled under MaintainerPolicy.
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

### 3. First survivor PR (evidence loop)

```bash
# Creates a tiny GitHub issue (or pass ISSUE_NUMBER), imports, queues (needs L1+)
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-first-pr.mjs

# Worker must be running:
#   GITHUB_DELIVERY_MODE=http + BYOK or CONTENDER_HARNESS=openhands
```

Then in product: open the task → review survivor PR (diff, CI, cost) → **Accept** once to prove the path.

**UI alternative:** Issues → **Import → queue**. **More → Repositories** verifies primary/secondaries; **Agents** shows the arena.

### 4. Enable maintainer mode (unattended ship)

After the first Accept→DONE on a **primary-targeted** PR:

```bash
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-enable-maintainer.mjs
```

This sets:

- Maintainer mode ON with **$5/mo** monthly envelope (5_000_000 micros)
- Autonomy **L2**, `mergeEnabled` + auto-merge / auto-accept
- Arena `min_human` ON, self-improve ON
- Vision brief retained as the maintainer north star

Worker ticks then triage → arena → auto-accept → auto-merge without further human PR approval. Intervene only via vision / budget / kill-switch.

### 5. Learning loop

If secondary context is useless after the first PR, harden worker secondary tree fetch under `maxSecondaryFiles`. Enable coordinated PRs only after primary maintainer ship is stable.

## Acceptance

- [x] One live `kprompt` project with 1 primary + ≤5 secondaries; siblings archived (2026-10-18 script)
- [x] Brief present (not Setup); arena ARMED (`dogfood-ready-arena.mjs`)
- [x] Issue #208 imported → task queued → REVIEW_REQUIRED with PR (first dogfood run wrongly opened [PR on kprompt-website](https://github.com/kprompt/kprompt-website/pull/19) via unfiltered multi-repo join; delivery now asserts `repoRole=primary`)
- [x] Accept → DONE on primary — issue [#210](https://github.com/kprompt/kprompt/issues/210) → [PR #211](https://github.com/kprompt/kprompt/pull/211) (`kprompt/kprompt`, `repoRole=primary`, workspace BYOK); then `dogfood-enable-maintainer.mjs`
- [x] Maintainer mode armed ($5/mo); L2 + auto-merge + self-improve (`dogfood-enable-maintainer.mjs`, 2026-10-18)
