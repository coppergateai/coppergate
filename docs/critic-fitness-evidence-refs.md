# Critic fitness cites evidence refs (P-142)

Fitness promote is blocked unless the rules critic can cite concrete evidence artifacts. PR presence alone is vibes — not a score.

## Gate

Non-zero fitness requires cited refs for:

1. **CI or validation** (`ci` / `validation` artifact ids)
2. **Tests** (`tests` from diff with test paths, or `coverage` / `e2e` artifacts)

Missing any of these → score `0`, reasons include `vibes_only_blocked` plus `missing_*` keys. Stub/toy remains an immediate disqualify.

Unknown optional channels (Sonar, coverage, e2e) no longer award partial credit unless that channel has a cited artifact.

## Persistence

`fitness_report` body/meta and `fitness.score` audit include `evidenceRefs: [{ kind, artifactId }, ...]`. Run `fitness_evidence_ref` still points at the fitness report itself.

## Surfaces

Arena payoff strip flags `vibes blocked`; tournament panel Why line notes vibes-only blocked when present.
