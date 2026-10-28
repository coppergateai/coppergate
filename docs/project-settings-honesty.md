# Project settings honesty (P-143)

Configuration tabs must describe **effective** behavior — what the worker and API gates actually do — not checkbox labels alone.

## L2 auto-merge

Two paths can merge a PR to the default branch:

| Path | Requires |
| --- | --- |
| **Accept** (TASK043) | Autonomy **L2** + **Merge after accept** on; human Accept with CI/fitness green |
| **Maintainer tick** | Above + **Maintainer on** + maintainer policy **auto-merge** on; still subject to ship gates and branch protection |

Neither path is “production deploy.” `prod_writes_enabled` on Arena stays off unless explicitly enabled; releases remain policy-gated.

Pure helpers: `describeL2AutoMerge` in `@coppergate/db` (`project-settings-honesty.ts`).

## min_human

After G1b, new arenas default **min_human on** (schema + `ensureArenaForProject`). Before an arena row exists, Settings show the effective default (on) instead of an unchecked box.

API `POST /api/projects/:id/arena` omits `minHuman` → same default as the DB insert.

## Maintainer mode

**Maintainer ON ≠ prod deploy** (PRODUCT §11 non-goals). Enabling maintainer sets L2, merge, and min_human for autonomous backlog work under the monthly envelope.

Fail-closed guards unchanged:

- Arena **kill-switch** cancels contenders and freezes enqueue
- **Spend envelope** hard-pauses at cap
- GitHub **branch protection** is never bypassed

UI copy is driven by `describeMaintainerSettingsHonesty`.

## Tests

- `packages/db/src/project-settings-honesty.test.ts` — effective flags and summaries
