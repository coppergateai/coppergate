export type {
  DeliverChangeRequestInput,
  DeliverChangeRequestResult,
  NormalizedScmWebhook,
  ScmDeliveryClient,
  ScmFileChange,
  ScmProviderId,
  ScmRepoRef,
} from "./types.js";

export { resolveScmApiBaseUrl } from "./api-base.js";
export {
  ScmDeliveryError,
  assertSafeBranch,
  scmWebBaseUrl,
} from "./policy.js";
export {
  ProdWritePolicyError,
  assertDefaultBranchContentsWriteAllowed,
  assertDefaultBranchMergeAllowed,
  assertProductionDeployAllowed,
  assertReleaseAllowed,
  resolveDefaultBranchMergeFlag,
} from "./prod-write-policy.js";
export {
  FakeBitbucketDelivery,
  HttpBitbucketDelivery,
} from "./bitbucket-delivery.js";
export {
  FakeAzureDevOpsDelivery,
  HttpAzureDevOpsDelivery,
} from "./ado-delivery.js";
export {
  createScmDeliveryClient,
  supportsScmDelivery,
  type CreateScmDeliveryOptions,
} from "./factory.js";

export {
  dominantLanguage,
  inferStackFromSignals,
  type DetectedStack,
  type KnownProjectStack,
  type LanguageBytes,
  type StackDetectionResult,
  type StackFileSignals,
} from "./stack.js";

import type { ScmProviderId } from "./types.js";

export function isScmProviderId(value: string): value is ScmProviderId {
  return (
    value === "github" ||
    value === "gitlab" ||
    value === "bitbucket" ||
    value === "azure_devops"
  );
}
