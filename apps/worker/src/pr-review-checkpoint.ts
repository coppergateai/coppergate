/**
 * F4 — PR-review delivery checkpoint helpers.
 * After a GitHub review COMMENT lands, persist delivery_checkpoint so reclaim
 * recovers to REVIEW_REQUIRED instead of failing VALIDATING / re-POSTing.
 */

import type { DeliveryCheckpointBody } from "@coppergate/db";

/** Skip GitHub review POST when a checkpoint already records this PR. */
export function shouldSkipPrReviewGithubPost(
  checkpoint: DeliveryCheckpointBody | null | undefined,
  prNumber: number,
): boolean {
  if (!checkpoint) return false;
  return checkpoint.prNumber === prNumber;
}
