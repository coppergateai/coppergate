# Maintainer enable — no silent escalation (AG-030)

PRODUCT §11: turning **Maintainer on** schedules autonomous backlog work under your envelope. It is **not** a side door for spend, tools, extra repos, or production writes.

## What enable does

- Sets autonomy **L2**, **merge after accept**, and arena **min_human** for unattended ticks (documented in `docs/project-settings-honesty.md`).
- Initializes the **workspace monthly envelope** only when no workspace budget row exists yet.

## What enable does **not** do (AG-030)

| Surface | Guard |
| --- | --- |
| **Spend** | Never raises an existing workspace `capMicros`. Policy `monthlyBudgetMicros` is clamped to the current cap; budget API remains the path to increase spend. |
| **Repos** | Does not turn on coordinated multi-repo or attach secondaries — use project multi-repo policy explicitly. |
| **Prod-adjacent** | Does not turn on maintainer **auto-release** on enable (P-144 default stays off until policy update). |
| **Signals / tools** | Cannot expand `allowedSignalProviders` beyond the default set on enable. |
| **Prod writes** | Does not set arena `prod_writes_enabled` (unchanged; off unless set elsewhere). |

Activity audit **`maintainer.enable`** records `escalationClamps` when anything was stripped or the cap was left unchanged.

## Regression

- `packages/db/src/maintainer-enable-guard.test.ts` — pure policy clamps
- `packages/db/src/maintainer.enable.test.ts` — integration (requires `DATABASE_URL`)
- `scripts/assert-ag030-maintainer-no-escalation.mjs` — static fail-closed check
