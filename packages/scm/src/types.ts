/** SCM provider discriminator (D12 + TASK117/118). */
export type ScmProviderId = "github" | "gitlab" | "bitbucket" | "azure_devops";

export type ScmRepoRef = {
  owner: string;
  repo: string;
  defaultBranch: string;
  /** Optional provider-native project path (GitLab path_with_namespace). */
  fullPath?: string;
  /**
   * TASK119 — GitHub Enterprise Server / self-hosted API host override.
   * e.g. https://github.example.com/api/v3
   */
  apiBaseUrl?: string;
};

export type ScmFileChange = {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

/**
 * Deliver a change request: GitHub Pull Request or GitLab Merge Request.
 * Field names keep `pr*` for compatibility with the GitHub delivery port.
 */
export type DeliverChangeRequestInput = {
  repo: ScmRepoRef;
  branchName: string;
  baseSha: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  files: ScmFileChange[];
  idempotencyKey: string;
};

export type DeliverChangeRequestResult = {
  branchName: string;
  headSha: string;
  /** PR number (GitHub) or MR iid (GitLab). */
  prNumber: number;
  prUrl: string;
  created: boolean;
  idempotencyKey: string;
};

export interface ScmDeliveryClient {
  deliverPullRequest(
    input: DeliverChangeRequestInput,
  ): Promise<DeliverChangeRequestResult>;
}

export type NormalizedScmWebhook = {
  provider: ScmProviderId;
  deliveryId: string;
  event: string;
  action?: string | null;
  installationExternalId?: string | null;
  projectExternalId?: string | null;
  rawPayload: string;
};
