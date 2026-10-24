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

After the first Accept→DONE on a **primary-targeted** PR **or** simply press **Start** on the project Arena panel:

```bash
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-enable-maintainer.mjs
```

**Day-to-day control (UI):** project → Survivor arena → **Start** / **Stop** only.

- **Start** — arms/resumes arena (`RUNNING`), turns on `min_human` + maintainer, re-queues interrupted work. No Accept clicks.
- **Stop** — soft-pause (`PAUSED`); freezes claims/fan-out; REVIEW_REQUIRED PRs stay so the next Start continues from there.

Script path still sets:

- Maintainer mode ON with **$5/mo** monthly envelope (5_000_000 micros)
- Autonomy **L2**, `mergeEnabled` + auto-merge / auto-accept
- Arena `min_human` ON, self-improve ON
- Vision brief retained as the maintainer north star

Worker ticks then triage → arena → auto-accept → auto-merge without further human PR approval. Intervene only via **Start/Stop**, vision, or budget.

### 5. Learning loop

If secondary context is useless after the first PR, harden worker secondary tree fetch under `maxSecondaryFiles`. Enable coordinated PRs only after primary maintainer ship is stable.

### 6. Autonomous backlog + second merge (no human Accept)

Maintainer ticks now:

1. **Vision replan → auto-queue** root DRAFT tasks (`autoQueueReplanTasks`, max N/tick)
2. **Winner-gated auto-accept** — only tournament `WINNER` + CI `acceptReady` (losers ignored)
3. **Auto-merge + release** — release tags use `releaseTagStyle` (`semver_patch` → `v0.YYYYMMDD.N` for kprompt)
4. **Go fitness** — primary stack `go` runs `go test ./...` in sandbox validation before REVIEW_REQUIRED
5. **Roles** — proposer / engineer / reviewer in the bounded catalog; vision replan arms proposer+engineer; meta-tournament arms engineer+reviewer

Prove unattended ship (≥2 auto-accepts, ≥1 auto-merge) against production DB:

```bash
# Worker must be live: GITHUB_DELIVERY_MODE=http
DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-maintainer-tick.mjs

DATABASE_URL="$DATABASE_URL" pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-prove-autonomous-merge.mjs
# exit 0 = proof; exit 2 = not yet (keep ticking)
```

Fixture proof (no GitHub): `packages/db/src/maintainer.autonomous.test.ts` with `DATABASE_URL`.

## Acceptance

- [x] One live `kprompt` project with 1 primary + ≤5 secondaries; siblings archived (2026-10-18 script)
- [x] Brief present (not Setup); arena ARMED (`dogfood-ready-arena.mjs`)
- [x] Issue #208 imported → task queued → REVIEW_REQUIRED with PR (first dogfood run wrongly opened [PR on kprompt-website](https://github.com/kprompt/kprompt-website/pull/19) via unfiltered multi-repo join; delivery now asserts `repoRole=primary`)
- [x] Accept → DONE on primary — issue [#210](https://github.com/kprompt/kprompt/issues/210) → [PR #211](https://github.com/kprompt/kprompt/pull/211) (`kprompt/kprompt`, `repoRole=primary`, workspace BYOK); then `dogfood-enable-maintainer.mjs`
- [x] Maintainer mode armed ($5/mo); L2 + auto-merge + self-improve (`dogfood-enable-maintainer.mjs`, 2026-10-18)
- [ ] Second autonomous merge on primary (human Accept = 0) — `dogfood-prove-autonomous-merge.mjs` exit 0
  - Ops notes (2026-10-24): Fly worker + web ship fail-close delivery, architecture Open ID replan, merge.blocked backoff, roadmap writeback, scout auto-import, ship rollback + richer release notes. Branch protection bypass still requires org admin (App got 403 on protection API) — add Coppergate App to PR review bypass / CODEOWNERS policy manually. Worker runtime includes Go (`GOTOOLCHAIN=auto`) for `go test ./...`. Prove against **Fly** `DATABASE_URL` (not laptop localhost): `scripts/dogfood-sole-dev-boot.mjs` then `scripts/dogfood-prove-autonomous-merge.mjs`; use `scripts/dogfood-unlock-merge.mjs` when merge is blocked.
- [x] Product path: vision replan auto-queue + winner-gated accept + Go `go test` fitness + proposer/engineer/reviewer + meta-tournament KPIs
