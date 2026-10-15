import {
  FakeAzureDevOpsDelivery,
  HttpAzureDevOpsDelivery,
} from "./ado-delivery.js";
import {
  FakeBitbucketDelivery,
  HttpBitbucketDelivery,
} from "./bitbucket-delivery.js";
import type { ScmDeliveryClient, ScmProviderId } from "./types.js";

export type CreateScmDeliveryOptions =
  | { provider: "bitbucket"; mode: "fake" }
  | {
      provider: "bitbucket";
      mode: "http";
      username: string;
      appPassword: string;
      workspace: string;
      repoSlug: string;
      apiBaseUrl?: string | null;
    }
  | { provider: "azure_devops"; mode: "fake" }
  | {
      provider: "azure_devops";
      mode: "http";
      organization: string;
      project: string;
      repositoryId: string;
      pat: string;
      apiBaseUrl?: string | null;
    };

/** Factory for TASK117/118 delivery clients. */
export function createScmDeliveryClient(
  opts: CreateScmDeliveryOptions,
): ScmDeliveryClient {
  if (opts.provider === "bitbucket") {
    if (opts.mode === "fake") return new FakeBitbucketDelivery();
    return new HttpBitbucketDelivery(opts);
  }
  if (opts.mode === "fake") return new FakeAzureDevOpsDelivery();
  return new HttpAzureDevOpsDelivery(opts);
}

export function supportsScmDelivery(provider: ScmProviderId): boolean {
  return (
    provider === "github" ||
    provider === "gitlab" ||
    provider === "bitbucket" ||
    provider === "azure_devops"
  );
}
