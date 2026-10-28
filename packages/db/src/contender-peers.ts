/**
 * Peer-only arena contenders — same profileKey, distinct strategies.
 * Cross-role duels (Fixer×QA, Engineer×Reviewer) are invalid.
 */

export const DEFAULT_PRIMARY_PROFILE_KEY = "engineer";

export const PEER_CONTENDER_STRATEGIES = [
  "balanced",
  "blitz",
  "fortress",
] as const;

export type PeerContenderStrategy = (typeof PEER_CONTENDER_STRATEGIES)[number];

export function isPeerContenderStrategy(
  value: string,
): value is PeerContenderStrategy {
  return (PEER_CONTENDER_STRATEGIES as readonly string[]).includes(value);
}

/** First bounded spawn key wins; spawn matrix is role assignment, not duel partners. */
export function primaryRoleForSpawn(
  keys: string[] | null | undefined,
  bounded?: ReadonlySet<string> | ReadonlyArray<string>,
): string {
  if (!keys || keys.length === 0) return DEFAULT_PRIMARY_PROFILE_KEY;
  const allow =
    bounded == null
      ? null
      : bounded instanceof Set
        ? bounded
        : new Set(bounded);
  for (const raw of keys) {
    const key = raw.trim();
    if (!key) continue;
    if (allow && !allow.has(key)) continue;
    return key;
  }
  return DEFAULT_PRIMARY_PROFILE_KEY;
}

/** Distinct strategies for N peer seats; preferred (if any) takes seat 0. */
export function strategiesForDuel(
  n: number,
  preferred?: string | null,
): PeerContenderStrategy[] {
  const count = Math.max(1, Math.floor(n));
  const start =
    preferred && isPeerContenderStrategy(preferred) ? preferred : "balanced";
  const ordered: PeerContenderStrategy[] = [
    start,
    ...PEER_CONTENDER_STRATEGIES.filter((s) => s !== start),
  ];
  const out: PeerContenderStrategy[] = [];
  for (let i = 0; i < count; i++) {
    out.push(ordered[i % ordered.length]!);
  }
  return out;
}

/** Meta challenger: same role, flipped strategy. */
export function flipContenderStrategy(
  strategy: string,
): PeerContenderStrategy {
  if (strategy === "blitz") return "fortress";
  if (strategy === "fortress") return "blitz";
  return "fortress";
}

/** True when every key is identical (peer tournament). */
export function isPeerTournament(profileKeys: string[]): boolean {
  if (profileKeys.length === 0) return true;
  const first = profileKeys[0]!;
  return profileKeys.every((k) => k === first);
}

export function assertPeerTournament(profileKeys: string[]): void {
  if (!isPeerTournament(profileKeys)) {
    const uniq = [...new Set(profileKeys)].join(",");
    throw new Error(
      `peer tournament invariant violated: mixed profileKeys [${uniq}]`,
    );
  }
}
