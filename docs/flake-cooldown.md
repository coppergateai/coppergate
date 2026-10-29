# Flake cooldown (AG-021)

`detectFlakePattern` already lived in `@coppergate/signals`. AG-021 **wires** it so oscillating CI checks do not thrash auto-arm or Retry.

## Behavior

| Gate | When | Action |
| --- | --- | --- |
| Webhook observe | Every `check_run` / Vercel `status` | Persist `ci_check_observation` artifact |
| Auto-arm | Unattached CI failure | Skip arm when fail↔pass within 30m (`flake_cooldown`) |
| Worker execute | `ci_failure` signal task | Fail closed with `errorCode=flake_cooldown` (no agent spend) |
| Evidence Retry | `retryFailedTask` | Policy refuse while oscillation active |

## Non-goals

- Does not hide AG-017 WAITING_CI honesty copy
- Does not invent Open IDs
- Single hard failure still arms normally

## Evidence

- `packages/signals/src/flake.test.ts`
- `packages/db/src/flake-cooldown.test.ts`
