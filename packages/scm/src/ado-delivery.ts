import { resolveScmApiBaseUrl } from "./api-base.js";
import { assertSafeBranch, ScmDeliveryError } from "./policy.js";
import type {
  DeliverChangeRequestInput,
  DeliverChangeRequestResult,
  ScmDeliveryClient,
} from "./types.js";

/** In-memory fake — Azure DevOps PR delivery (TASK118). */
export class FakeAzureDevOpsDelivery implements ScmDeliveryClient {
  readonly pullRequests = new Map<string, DeliverChangeRequestResult>();
  private seq = 4000;

  async deliverPullRequest(
    input: DeliverChangeRequestInput,
  ): Promise<DeliverChangeRequestResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    const existing = this.pullRequests.get(input.idempotencyKey);
    if (existing) return { ...existing, created: false };

    this.seq += 1;
    const org = input.repo.owner;
    const project = input.repo.fullPath?.split("/")[1] ?? input.repo.repo;
    const result: DeliverChangeRequestResult = {
      branchName: input.branchName,
      headSha: `adofake${this.seq.toString(16)}`,
      prNumber: this.seq,
      prUrl: `https://dev.azure.com/${org}/${project}/_git/${input.repo.repo}/pullrequest/${this.seq}`,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
    this.pullRequests.set(input.idempotencyKey, result);
    return result;
  }
}

type FetchLike = typeof fetch;

/**
 * Azure DevOps Repos HTTP delivery (TASK118).
 * Pushes via pushes API then creates a pull request.
 */
export class HttpAzureDevOpsDelivery implements ScmDeliveryClient {
  constructor(
    private readonly opts: {
      organization: string;
      project: string;
      repositoryId: string;
      pat: string;
      apiBaseUrl?: string | null;
      fetchImpl?: FetchLike;
    },
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`:${this.opts.pat}`).toString("base64")}`;
  }

  async deliverPullRequest(
    input: DeliverChangeRequestInput,
  ): Promise<DeliverChangeRequestResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    if (!input.files.length) {
      throw new ScmDeliveryError("invalid", "files required");
    }

    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const base = resolveScmApiBaseUrl("azure_devops", this.opts.apiBaseUrl);
    const repoApi = `${base}/${encodeURIComponent(this.opts.organization)}/${encodeURIComponent(this.opts.project)}/_apis/git/repositories/${encodeURIComponent(this.opts.repositoryId)}`;

    const changes = input.files.map((f) => ({
      changeType: "add",
      item: { path: `/${f.path.replace(/^\//, "")}` },
      newContent: {
        content:
          f.encoding === "base64"
            ? Buffer.from(f.content, "base64").toString("utf8")
            : f.content,
        contentType: "rawtext",
      },
    }));

    const pushRes = await fetchImpl(`${repoApi}/pushes?api-version=7.1`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refUpdates: [
          {
            name: `refs/heads/${input.branchName}`,
            oldObjectId: "0000000000000000000000000000000000000000",
          },
        ],
        commits: [
          {
            comment: input.commitMessage,
            changes,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!pushRes.ok) {
      throw new ScmDeliveryError(
        "http",
        `ADO push failed: ${pushRes.status}`,
      );
    }
    const push = (await pushRes.json()) as {
      commits?: Array<{ commitId?: string }>;
    };
    const headSha = push.commits?.[0]?.commitId ?? input.baseSha;

    const prRes = await fetchImpl(
      `${repoApi}/pullrequests?api-version=7.1`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceRefName: `refs/heads/${input.branchName}`,
          targetRefName: `refs/heads/${input.repo.defaultBranch}`,
          title: input.prTitle,
          description: input.prBody,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!prRes.ok) {
      throw new ScmDeliveryError(
        "http",
        `ADO PR create failed: ${prRes.status}`,
      );
    }
    const pr = (await prRes.json()) as {
      pullRequestId: number;
      url?: string;
    };

    return {
      branchName: input.branchName,
      headSha,
      prNumber: pr.pullRequestId,
      prUrl:
        pr.url ??
        `https://dev.azure.com/${this.opts.organization}/${this.opts.project}/_git/${this.opts.repositoryId}/pullrequest/${pr.pullRequestId}`,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
  }
}
