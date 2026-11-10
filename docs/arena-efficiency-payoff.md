# Arena efficiency payoff (P-140)

Tournament resolve ranks by efficiency `e = f / spend^α` (default `α=0.25`) with CI fail forcing `e=0`. Promote is **fail-closed**: when `max(e) ≤ 0` the tournament ends `NO_QUALIFYING` (no lex-UUID winner) — see [`mechanism-fail-closed.md`](./mechanism-fail-closed.md). P-140 surfaces that math on the Arena board so selection is readable without opening the task tournament panel.

## Surfaces

- **Tournament strip** (`TournamentFlowGraph`): meta includes `e=f/spend^α`; runners show `e · f · spend`; resolved winners show a promote reason line.
- **Lane agent cards** (`arena-spectacle`): metrics row uses the same compact format; winner lane shows promote copy under the roster.
- **Agent inspector**: optional payoff block from live lane scores.
- **Task tournament panel**: Decision line shares `formatPromoteReason`.

## Helpers

`apps/web/src/app/workspaces/[id]/arena/payoff-display.ts` — `formatPayoffMetrics`, `formatPromoteReason`, spend fallback (actual → estimate).
