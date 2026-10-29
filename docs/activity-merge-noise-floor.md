# AG-019 — Activity merge.attempt noise floor

Maintainer auto-merge can emit many `merge.attempt` audits when GitHub reports **not mergeable** (checks pending, dirty state, and so on). Cycle 11 added a **30m retry cooldown** at the worker and **per-project Activity bucketing** so interleaved ticks do not flood the timeline.

AG-019 tightens the **display** layer for pure not-ready storms:

| Bucket contents | Timeline row |
| --- | --- |
| All attempts `merged: false` (not-ready storm) | One collapsed row per project; **summary = latest attempt message**; technical label still shows `attempt ×N` |
| Mix of merged + not-ready | Honest aggregate (`N merged · M not ready`) — unchanged from Cycle 11 |
| All merged | `PRs merged` with completed outcome |

Bucketing key remains `merge.attempt|{projectId}` (fallback: task / workspace), so events from other actions can sit between attempts without breaking collapse.

## Testing

- `apps/web/src/app/workspaces/[id]/activity/events.test.ts` — interleaved collapse, AG-019 last-outcome summary, per-project keys.

## Related

- Cycle 11 auto-merge backoff: `docs/RELIABILITY_LOG.md`
- Maintainer skip PRs during cooldown: `packages/db/src/maintainer.ts` (`resolveAutoMergeSkipPrs`)
