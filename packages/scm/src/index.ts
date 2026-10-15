export type {
  DeliverChangeRequestInput,
  DeliverChangeRequestResult,
  NormalizedScmWebhook,
  ScmDeliveryClient,
  ScmFileChange,
  ScmProviderId,
  ScmRepoRef,
} from "./types.js";

import type { ScmProviderId } from "./types.js";

export function isScmProviderId(value: string): value is ScmProviderId {
  return value === "github" || value === "gitlab";
}
