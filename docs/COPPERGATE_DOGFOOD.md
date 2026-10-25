# Coppergate self-pilot dogfood

Second dogfood instance: **Coppergate develops Coppergate**. Keep the **kprompt** workspace Arena **paused** while this pilot runs so the shared OpenAI org cap (~$10/mo) is not double-burned.

Role prompts (`product.txt`, `designer.txt`, `landing.txt`, `seo.txt`, `qa.txt`, `security.txt`, `agent_reliability.txt`) are productized as system skills (`product-cpo`, `designer-ux`, `landing-cro`, `seo-growth`, `qa-explore`, `security-asvs`, `agent-reliability`) wired onto bounded profiles — not seven new arena roles.

## Constraints

- Monthly envelope **$8** (soft buffer under typical OpenAI $10 hard cap).
- Community concurrency: **6** workspace / **1** per project; tournament fan-out **1**.
- Lean roster when project `availableMicros` is under $2 (engineer + reviewer only).
- **Do not** run `dogfood-consolidate-repos.mjs` (kprompt-specific).
- Fly deploy / secrets / OpenAI limit changes: **human**.
- Public pricing stays Community / self-host **$0** only.

## Workspace

| Item | Value |
| --- | --- |
| Workspace | `coppergate` · `/coppergate` |
| Workspace id | `2c894510-810e-46cc-8ff0-652f63870639` |
| Monthly envelope | **$8** (set in Settings → General) |
| kprompt Arena | Keep **paused** (`Resume all` only) |

**GitHub App note:** Hosted kprompt today installs against the **kprompt** GitHub org only. For this pilot, open Settings → Connections on the **coppergate** workspace → **Install GitHub App** → select the **coppergateai** org (and repos `coppergate` + `coppergate-architecture`). `github_installation_id` is unique per workspace, so this is a separate install from kprompt’s.

## Repo map

| Role | Repo |
| --- | --- |
| Primary | `coppergateai/coppergate` (project name `coppergate`) |
| Architecture roadmap | `coppergateai/coppergate-architecture` → `docs/OPEN_PROGRAM.md` |

## Env defaults

```bash
export WORKSPACE_SLUG=coppergate
export PRIMARY_NAME=coppergate
export ARCHITECTURE_REPO=coppergateai/coppergate-architecture
export ARCHITECTURE_PATHS=docs/OPEN_PROGRAM.md
export MAINTAINER_BUDGET_MICROS=8000000
export DOGFOOD_BUDGET_MICROS=8000000
```

## Open Program Runtime

Self-pilot proves **Contracted Autonomy**:

- Maintainer `architectureRepo` / `architecturePaths` bind the program → **Spend License** (no Open ID → no reserve).
- Evidence / task rows show an **Open ID** badge.
- **Accept → Ship Receipt** at  
  `/workspaces/{id}/projects/{projectId}/tasks/{taskId}/receipt`  
  (spend, fitness, CI, winner profile, human touches, writeback note).
- Docs: `/docs/open-program-runtime`. Public pricing stays Community **$0**.

### Prove Ship Receipt (after Accept)

```bash
DATABASE_URL="$DATABASE_URL" \
  WORKSPACE_SLUG=coppergate \
  pnpm --filter @coppergate/db exec node --import tsx \
    ../../packages/db/scripts/dogfood-prove-ship-receipt.ts
```

## Steps

### 1. Boot (budget + brief + arena + Open IDs)

```bash
cd coppergate
set -a && source .env && set +a   # or Fly DATABASE_URL

DATABASE_URL="$DATABASE_URL" \
  WORKSPACE_SLUG=coppergate \
  PRIMARY_NAME=coppergate \
  ARCHITECTURE_REPO=coppergateai/coppergate-architecture \
  ARCHITECTURE_PATHS=docs/OPEN_PROGRAM.md \
  MAINTAINER_BUDGET_MICROS=8000000 \
  pnpm --filter @coppergate/db exec node --import tsx \
    ../../scripts/dogfood-coppergate-boot.mjs
```

Creates/approves a self-pilot brief, sets **$8** envelopes, arms min_human arena (N=1), seeds skills/profiles, verifies Open IDs parse from `OPEN_PROGRAM.md`. Pass `--start` to call `startProjectArena` (maintainer + replan).

### 2. First verified PR (human Accept once)

Pick a single Open ID (e.g. `AG-010` or `P-101`):

- UI: Arena **Start** (if not `--start`) → wait for queued task → Evidence **Accept**, or
- Script path after worker is live: import/queue via Issues, then Accept once.

Worker must use workspace BYOK (`gpt-4.1-mini` recommended) with spend throttle already shipped.

### 3. Enable unattended maintainer (after first Accept)

```bash
DATABASE_URL="$DATABASE_URL" \
  WORKSPACE_SLUG=coppergate \
  PRIMARY_NAME=coppergate \
  MAINTAINER_BUDGET_MICROS=8000000 \
  pnpm --filter @coppergate/db exec node --import tsx \
    ../../scripts/dogfood-enable-maintainer.mjs
```

Day-to-day: project Arena **Start** / **Stop** only. Keep kprompt paused.

### 4. Prove loop checklist

- [ ] One Open ID → survivor PR → CI → Accept → architecture writeback **Done**
- [ ] Accept opens a visible **Ship Receipt** (Open ID + spend + fitness + CI)
- [ ] `ships_with_open_id / total_accepts` = 100%; `spend_without_open_id` = 0
- [ ] Second Open ID auto-queues under continuous backlog
- [ ] Inflight ≤6 and ≤1/project
- [ ] No `using workspace BYOK` storms while paused
- [ ] Mission Control still surfaces `provider_quota` / concurrency crises

## Skills ↔ profiles

| Profile | Skills |
| --- | --- |
| proposer | product-cpo, pr-hygiene |
| engineer | pr-hygiene, designer-ux, landing-cro |
| docs | seo-growth, pr-hygiene |
| qa | qa-explore, pr-hygiene |
| security | security-asvs, sonar-remediation, pr-hygiene |
| fixer / reviewer | agent-reliability, … |

Spawn providers: `product_gap`, `ux_audit`, `seo_audit`, `landing_audit`, `reliability` (still clamped by plan fan-out).
