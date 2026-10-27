# Mission Control crisis clarity (P-101)

## Overview

Mission Control (`/workspaces/[id]`) surfaces what needs human intervention now. During **capacity crisis** — workspace concurrency over plan limits or LLM **provider quota** exhaustion — the overview prioritizes stopping burn before triage.

## Behavior

### Lead attention

Attention rows sort with this crisis order:

1. **Concurrency** — more in-flight runs than the plan allows; primary CTA is Pause Arena.
2. **Provider quota** — Arena paused after `arena.pause_provider_quota`; raise provider limits or wait for reset.
3. **Merge blocked** — branch protection / rights (still high priority, below quota/concurrency).

Inbox approvals, Evidence Accept, and budget rows follow after crisis rows.

### Muted secondary alerts

While `capacityCrisis` is true (concurrency over cap **or** recent provider-quota pause audit), Mission Control **does not** add arena failure, replan failure, or merge-blocked digests from arena telemetry — those are usually symptoms of the crisis.

The **needs attention** metric omits arena agent counts during crisis so the summary strip stays honest (`inbox · evidence · arena · crisis`).

### Empty states

When panels are empty, copy reflects the real blocker (budget paused, crisis active, missing budget cap, or idle pipeline) instead of a generic Open Program ID message.

## Testing

- `packages/db/src/mission-control.test.ts` — attention sort ranks.
- `packages/db/src/maintainer.quota.test.ts` — provider quota → `capacityCrisis` and lead row.
- `apps/web/src/lib/mission-control-view.test.ts` — honest attention totals and empty copy.

## Change history

- v1.0 (P-101): Crisis lead ordering, capacity crisis suppression, UI metrics and empty states.
