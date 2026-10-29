# Project settings honesty (P-143)

Configuration tabs must describe **effective** behavior — what the worker and API gates actually do — not checkbox labels alone.

## L2 auto-merge

Two paths can merge a PR to the default branch:

| Path | Requires |
| --- | --- |
| **Accept** (TASK043) | Autonomy **L2** + **Merge after accept** on; human Accept with CI/fitness green |
| **Maintainer tick** | Above + **Maintainer on** + maintainer policy **auto-merge** on; still subject to ship gates and branch protection |

Neither path is “production deploy.” `prod_writes_enabled` on Arena stays off unless explicitly enabled; releases remain policy-gated.

SEC-036 enforces this in code: merge, release, default-branch Contents writes, and sandbox deploy commands fail closed without the matching flag. See `docs/prod-write-policy-gate.md`.

Pure helpers: `describeL2AutoMerge` in `@coppergate/db` (`project-settings-honesty.ts`).

## min_human

After G1b, new arenas default **min_human on** (schema + `ensureArenaForProject`). Before an arena row exists, Settings show the effective default (on) instead of an unchecked box.

API `POST /api/projects/:id/arena` omits `minHuman` → same default as the DB insert.

## Maintainer mode

**Maintainer ON ≠ prod deploy** (PRODUCT §11 non-goals). Enabling maintainer sets L2, merge, and min_human for autonomous backlog work under the monthly envelope.

**AG-030:** Maintainer enable cannot silently raise spend, expand signal providers, enable multi-repo, or turn on auto-release. See `docs/maintainer-enable-no-escalation.md`.

Fail-closed guards unchanged:

- Arena **kill-switch** cancels contenders and freezes enqueue
- **Spend envelope** hard-pauses at cap
- GitHub **branch protection** is never bypassed

UI copy is driven by `describeMaintainerSettingsHonesty`.

## L3 Release Assistant (P-144)

**Auto-release** on maintainer policy is **off by default**. When on, maintainer ticks create a GitHub tag + Release after merges — still not prod deploy. Copy: `describeReleaseAssistantHonesty`. See `docs/l3-release-assistant.md`.

## Tests

- `packages/db/src/project-settings-honesty.test.ts` — effective flags and summaries
- `packages/db/src/maintainer-enable-guard.test.ts` — AG-030 enable clamps
