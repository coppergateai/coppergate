# Arena pause drain (P-102)

Workspace Arena distinguishes **Pause all** (soft drain) from **Stop all** (hard kill). While arenas are paused, the roster strip and Mission Control must not treat draining CI/review work as an ops fire.

## Controls

| Action | Effect | Primary button label |
| --- | --- | --- |
| **Pause all** | Soft pause per project; in-flight runs finish; no new enqueue | Shown while workspace is **Live** |
| **Resume all** | Start/resume fan-out after a soft pause | Shown while workspace is **Paused** |
| **Start all** | Arm projects that were stopped/killed (never paused) | Shown while workspace is **Stopped** |
| **Stop all** | Kill arenas and cancel open runs; confirm before apply | Always available to owners |

Workspace status pill: **Live**, **Paused**, or **Stopped** (paused is not lumped into stopped).

## Attention classifier

`classifyContenderRuntime` in `@coppergate/db` (`workspace-arena.ts`) drives the summary strip and Mission Control arena lanes:

- While the arena is **not live** (`PAUSED` or `KILLED`), `VALIDATING`, `WAITING_CI`, and `REVIEW_REQUIRED` count as **idle**, not awaiting CI or needs attention.
- Terminal failures (`FAILED`, `BLOCKED`, `EXPIRED`) stay quiet until the arena is live again.
- `RUNNING` / `QUEUED` still show as **running** during drain so operators see what is finishing.

The web Arena page mirrors the same rules in `arena-spectacle.tsx`.

Expanded project lanes also surface **efficiency payoff** for the active task contest: fitness `f`, spend, `e = f/spend^α` (arena `payoffAlpha`), CI fail ⇒ `e=0`, and a winner promote reason when the tournament is resolved. Data is built in `buildEfficiencyBoard` (`arena-efficiency-board.ts`) inside the workspace arena snapshot API.

## Operator copy

- Paused lede explains drain + Resume vs Stop.
- Project Arena panel links to workspace Arena for Pause/Resume/Stop (not per-project Start/Stop).

## Validation

- `packages/db/src/workspace-arena.test.ts` — classifier + fan-out pause status `PAUSED`.

## Version history

- v1.0 (P-102): Paused workspace status, drain copy, Resume/Start/Stop labels, quiet CI/review while paused.
