/**
 * Pure run pickers for Accept / CI refresh (shared by maintainer + task review).
 * Kept out of maintainer.ts so task-transitions can import without a cycle.
 */

/**
 * Pick the run eligible for Accept (human or maintainer auto-accept).
 * Tournament tasks require an explicit WINNER — unless every peer shares the
 * same delivery (one PR / one headSha), which is multi-profile fan-out, not a
 * competing duel. Those are treated as solo so unattended auto-accept works.
 */
export function selectAutoAcceptRun<
  T extends {
    tournamentId: string | null;
    tournamentResult: string | null;
    status?: string | null;
    prNumber?: number | null;
    headSha?: string | null;
  },
>(runs: T[]): T | null {
  if (runs.length === 0) return null;
  const winner = runs.find((r) => r.tournamentResult === "WINNER");
  if (winner) return winner;
  const inTournament = runs.some((r) => r.tournamentId != null);
  if (!inTournament) return runs[0] ?? null;

  const prNums = [
    ...new Set(
      runs
        .map((r) => r.prNumber)
        .filter((n): n is number => typeof n === "number" && n > 0),
    ),
  ];
  const shas = [
    ...new Set(
      runs
        .map((r) => r.headSha?.trim())
        .filter((s): s is string => Boolean(s) && s !== "unknown"),
    ),
  ];
  const sameDelivery =
    prNums.length === 1 || (prNums.length === 0 && shas.length === 1);
  if (!sameDelivery) return null;

  const review = runs.find((r) => r.status === "REVIEW_REQUIRED");
  return review ?? runs[0] ?? null;
}

/**
 * Pick a run to poll live GitHub CI for — must work BEFORE tournament WINNER
 * exists. Unresolved tournaments stay WAITING_CI until CI promotes them; if we
 * only refresh winners, dogfood N=1 deadlocks (no CI → no WINNER → no CI).
 */
export function selectCiRefreshRun<
  T extends {
    status: string;
    tournamentId: string | null;
    tournamentResult: string | null;
    headSha: string | null;
  },
>(runs: T[]): T | null {
  const withSha = (r: T) =>
    Boolean(r.headSha && r.headSha !== "unknown" && r.headSha.length > 0);
  const awaiting = runs.filter(
    (r) =>
      (r.status === "WAITING_CI" || r.status === "REVIEW_REQUIRED") &&
      withSha(r),
  );
  if (awaiting.length === 0) return null;
  const winner = awaiting.find((r) => r.tournamentResult === "WINNER");
  if (winner) return winner;
  // Prefer the delivered WAITING_CI contender over REVIEW_REQUIRED leftovers.
  const waiting = awaiting.find((r) => r.status === "WAITING_CI");
  return waiting ?? awaiting[0] ?? null;
}
