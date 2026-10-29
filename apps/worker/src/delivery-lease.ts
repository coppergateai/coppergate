/**
 * F3 — Delivery lease sizing + heartbeat wall.
 * Single pre-delivery renew was not enough for slow multi-file GitHub http;
 * we renew through deliver→checkpoint, but stop after a wall so hung calls
 * cannot pin VALIDATING forever (Cycle 11 intent preserved).
 */

export const DEFAULT_DELIVERY_LEASE_BASE_MS = 5 * 60_000;
export const DEFAULT_DELIVERY_LEASE_PER_FILE_MS = 45_000;
/** Cap a single renew window (also scales file budget). */
export const DEFAULT_DELIVERY_LEASE_MAX_MS = 20 * 60_000;
/** Stop renewing after this wall from delivery start. */
export const DEFAULT_DELIVERY_HEARTBEAT_WALL_MS = 25 * 60_000;

export function resolveDeliveryLeaseMs(input: {
  leaseMs: number;
  fileCount: number;
  baseMs?: number;
  perFileMs?: number;
  maxMs?: number;
}): number {
  const base = input.baseMs ?? DEFAULT_DELIVERY_LEASE_BASE_MS;
  const perFile = input.perFileMs ?? DEFAULT_DELIVERY_LEASE_PER_FILE_MS;
  const max = input.maxMs ?? DEFAULT_DELIVERY_LEASE_MAX_MS;
  const n = Math.max(1, Math.floor(Number(input.fileCount) || 1));
  // Base covers the first file; each extra file adds perFileMs.
  const scaled = base + (n - 1) * perFile;
  return Math.max(input.leaseMs, Math.min(max, scaled));
}

export function shouldRenewDeliveryHeartbeat(input: {
  deliveryStartedAtMs: number;
  nowMs: number;
  wallMs?: number;
}): boolean {
  const wall = input.wallMs ?? DEFAULT_DELIVERY_HEARTBEAT_WALL_MS;
  return input.nowMs - input.deliveryStartedAtMs < wall;
}

export function deliveryHeartbeatIntervalMs(deliveryLeaseMs: number): number {
  return Math.max(1_000, Math.floor(deliveryLeaseMs / 3));
}
