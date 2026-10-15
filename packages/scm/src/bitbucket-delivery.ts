import { resolveScmApiBaseUrl } from "./api-base.js";
import { assertSafeBranch, ScmDeliveryError } from "./policy.js";
import type {
  DeliverChangeRequestInput,
  DeliverChangeRequestResult,
  ScmDeliveryClient,
} from "./types.js";

/** In-memory fake — Bitbucket Cloud PR delivery (TASK117). */
export class FakeBitbucketDelivery implements ScmDeliveryClient {
  readonly pullRequests = new Map<string, DeliverChangeRequestResult>();
  private seq = 3000;

  async deliverPullRequest(
    input: DeliverChangeRequestInput,
  ): Promise<DeliverChangeRequestResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    const existing = this.pullRequests.get(input.idempotencyKey);
    if (existing) return { ...existing, created: false };

    this.seq += 1;
    const path = `${input.repo.owner}/${input.repo.repo}`;
    const result: DeliverChangeRequestResult = {
      branchName: input.branchName,
      headSha: `bbfake${this.seq.toString(16)}`,
      prNumber: this.seq,
      prUrl: `https://bitbucket.org/${path}/pull-requests/${this.seq}`,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
    this.pullRequests.set(input.idempotencyKey, result);
    return result;
  }
}

type FetchLike = typeof fetch;

/**
 * Bitbucket Cloud HTTP delivery (TASK117).
 * Creates a commit on a new branch via src API, then opens a pull request.
 */
export class HttpBitbucketDelivery implements ScmDeliveryClient {
  constructor(
    private readonly opts: {
      username: string;
      appPassword: string;
      workspace: string;
      repoSlug: string;
      apiBaseUrl?: string | null;
      fetchImpl?: FetchLike;
    },
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(
      `${this.opts.username}:${this.opts.appPassword}`,
    ).toString("base64")}`;
  }

  async deliverPullRequest(
    input: DeliverChangeRequestInput,
  ): Promise<DeliverChangeRequestResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    if (!input.files.length) {
      throw new ScmDeliveryError("invalid", "files required");
    }

    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const base = resolveScmApiBaseUrl("bitbucket", this.opts.apiBaseUrl);
    const repoApi = `${base}/repositories/${encodeURIComponent(this.opts.workspace)}/${encodeURIComponent(this.opts.repoSlug)}`;

    const form = new FormData();
    form.set("message", input.commitMessage);
    form.set("branch", input.branchName);
    form.set("parents", input.baseSha);
    for (const f of input.files) {
      const content =
        f.encoding === "base64"
          ? Buffer.from(f.content, "base64").toString("utf8")
          : f.content;
      form.set(f.path, new Blob([content]));
    }

    const commitRes = await fetchImpl(`${repoApi}/src`, {
      method: "POST",
      headers: { Authorization: this.authHeader() },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!commitRes.ok) {
      throw new ScmDeliveryError(
        "http",
        `Bitbucket src commit failed: ${commitRes.status}`,
      );
    }

    const prRes = await fetchImpl(`${repoApi}/pullrequests`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.prTitle,
        description: input.prBody,
        source: { branch: { name: input.branchName } },
        destination: { branch: { name: input.repo.defaultBranch } },
        close_source_branch: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!prRes.ok) {
      throw new ScmDeliveryError(
        "http",
        `Bitbucket PR create failed: ${prRes.status}`,
      );
    }
    const pr = (await prRes.json()) as {
      id: number;
      links?: { html?: { href?: string } };
    };

    return {
      branchName: input.branchName,
      headSha: input.baseSha,
      prNumber: pr.id,
      prUrl:
        pr.links?.html?.href ??
        `https://bitbucket.org/${this.opts.workspace}/${this.opts.repoSlug}/pull-requests/${pr.id}`,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
  }
}
