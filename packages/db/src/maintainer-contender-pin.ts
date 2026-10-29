/**
 * AG-018 — Vision replan must re-pin arena.defaultContenderN to maintainer
 * maxTournamentN (hard cap 3) so invent/spawn cannot drift duel width above policy.
 */

/** Same value as `arena.MIN_DUEL_CONTENDERS` — kept local so pin math stays import-light. */
const MIN_DUEL_CONTENDERS = 2;

/** Matches parseMaintainerPolicy clamp on maxTournamentN. */
export const MAINTAINER_TOURNAMENT_N_CAP = 3;

/** Policy-driven pin for defaultContenderN and replan seatCount. */
export function maintainerContenderPinN(maxTournamentN: number): number {
  if (!Number.isFinite(maxTournamentN)) return 1;
  return Math.max(
    1,
    Math.min(MAINTAINER_TOURNAMENT_N_CAP, Math.floor(maxTournamentN)),
  );
}

export function defaultContenderNWithinMaintainerPolicy(
  arenaDefaultContenderN: number,
  maxTournamentN: number,
): boolean {
  const pin = maintainerContenderPinN(maxTournamentN);
  return (
    Number.isFinite(arenaDefaultContenderN) &&
    arenaDefaultContenderN >= 1 &&
    arenaDefaultContenderN <= pin
  );
}

/** Peer spawn width capped by maintainer policy (N=1 dogfood allowed). */
export function peerSeatCountForSpawn(input: {
  seatCount?: number;
  arenaDefaultContenderN: number;
  policyMaxContenderN?: number;
}): number {
  const cap =
    input.policyMaxContenderN != null &&
    Number.isFinite(input.policyMaxContenderN)
      ? Math.max(1, Math.floor(input.policyMaxContenderN))
      : null;

  const rawRequested =
    input.seatCount != null && Number.isFinite(input.seatCount)
      ? Math.floor(input.seatCount)
      : Math.max(input.arenaDefaultContenderN, MIN_DUEL_CONTENDERS);

  let n = Math.max(1, rawRequested);
  if (cap != null) n = Math.min(n, cap);

  if (cap == null || cap >= MIN_DUEL_CONTENDERS) {
    n = Math.max(n, MIN_DUEL_CONTENDERS);
    if (cap != null) n = Math.min(n, cap);
  }
  return Math.max(1, n);
}
