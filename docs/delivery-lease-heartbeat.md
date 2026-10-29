# Delivery lease through checkpoint (F3)

## Problem

Cycle 11 stopped the agent heartbeat before GitHub delivery and renewed once (≥5m) so hung http could not pin `VALIDATING` forever. Slow multi-file PR delivery can still exceed that single window; the reaper then fails the run with `validating_lease_expired` **before** `delivery_checkpoint` is written — even if GitHub eventually accepts the PR.

## Behavior

1. Scale delivery lease by file count: base 5m + 45s/extra file, capped at 20m (never below worker `leaseMs`).
2. Start a **delivery heartbeat** that renews that lease until either:
   - `delivery_checkpoint` is persisted (or PR-review finalize), or
   - a **25m wall** from delivery start (then stop renewing — hung calls expire).
3. Clear delivery heartbeat in the execute `finally` (and on cancel).

## Non-goals

- Does not replace delivery_checkpoint recovery.
- Does not add a durable PR-review checkpoint (still open — F4).

## Tests

- `apps/worker/src/delivery-lease.test.ts` — sizing + wall helpers
