# PR-review delivery checkpoint (F4)

## Problem

Brownfield `pr_review` posts a GitHub COMMENT then finalizes the run. A crash after the POST (before durable state) left VALIDATING to fail closed (`validating_lease_expired`) or reclaim could post a duplicate review. Code delivery already had `delivery_checkpoint`; review did not.

## Behavior

1. Load existing `delivery_checkpoint` for the run.
2. If checkpoint `prNumber` matches the task PR → **skip** GitHub COMMENT (resume).
3. Otherwise POST COMMENT (http) / prepare (fake), then **immediately** `persistDeliveryCheckpoint` with `awaitLiveCi: false`.
4. Reaper recovery via existing checkpoint path → `REVIEW_REQUIRED`.

## Residual

Crash between successful POST and checkpoint write can still duplicate a COMMENT once — same class as pre-checkpoint code delivery. Closing that needs GitHub-side idempotency or review listing.

## Tests

- `apps/worker/src/pr-review-checkpoint.test.ts`
