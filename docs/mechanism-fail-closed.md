# Mechanism fail-closed promote (Phase M+)

All-pay efficiency contest promote is **fail-closed**: selection requires positive efficiency evidence.

## Rule

`e = f / spend^α`. Promote the max-`e` contender **only if** `max(e) > 0`.

When every contender has `e ≤ 0` (CI fail hard-gate, vibes-only / P-142 zero fitness, stub DQ, etc.):

- Tournament status → `NO_QUALIFYING`
- `winnerRunId` stays null (no lex-UUID lottery)
- ContenderRuns marked `LOSER` (all-pay); loser debit still applies
- Audit `tournament.resolve` meta includes `resolveReason: "no_qualifying_contender"`

## Code

- Pure math: `packages/db/src/mechanism.ts` (`selectWinnerByPayoff`, α presets)
- Resolve: `resolveTournamentByFitness` / `scoreAndResolveTournament`
- Board copy: `formatNoQualifyingReason` in arena `payoff-display.ts`

## α presets

| Preset | α |
|---|---|
| `fitness_first` | 0 |
| `default` | 0.25 |
| `thrift` | 0.5 |

`setArenaPayoffAlpha({ preset })` or numeric α ≥ 0.

## Strategies

Action profiles (`blitz` / `fortress` / `balanced`) shape spend bias and prompt guidance only — they do **not** change critic channel weights. See `GAME_THEORY.md` §5.
