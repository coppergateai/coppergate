# Maintainer replan — contender N pin (AG-018)

Dogfood **vision replan** (`runVisionReplan`) re-arms peer engineer seats and **re-pins** `arena.defaultContenderN` to the project maintainer policy `maxTournamentN` (clamped 1–3). Invent/spawn paths must not leave duel width above that cap.

## Behavior

- After each successful replan that ships an Open Program task, spawn uses `policyMaxContenderN` so peer seat count and `defaultContenderN` stay ≤ `maxTournamentN`.
- Meta-tournament (self-improve) only widens to N=2 when policy allows ≥2; N=1 dogfood (e.g. ACPP) is not forced to a duel.
- Maintainer enable and **Start** arena use the same pin helper.

## Tests

- `packages/db/src/maintainer-contender-pin.test.ts` — pin math + spawn cap
- `packages/db/src/maintainer.replan-contender-pin.test.ts` — replan integration (requires `DATABASE_URL`)
