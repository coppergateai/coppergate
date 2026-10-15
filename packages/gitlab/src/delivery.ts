import type {
  DeliverChangeRequestInput,
  DeliverChangeRequestResult,
  ScmDeliveryClient,
} from "@coppergate/scm";
import { normalizeGitlabBaseUrl } from "./oauth.js";

export class GitlabDeliveryError extends Error {
  readonly code: "policy" | "not_found" | "conflict" | "http" | "invalid";

  constructor(code: GitlabDeliveryError["code"], message: string) {
    super(message);
    this.name = "GitlabDeliveryError";
    this.code = code;
  }
}

export function assertSafeBranch(
  branchName: string,
  defaultBranch: string,
): void {
  const branch = branchName.trim();
  const def = defaultBranch.trim();
  if (!branch) {
    throw new GitlabDeliveryError("invalid", "branchName is required");
  }
  if (!def) {
    throw new GitlabDeliveryError("invalid", "defaultBranch is required");
  }
  if (branch === def) {
    throw new GitlabDeliveryError(
      "policy",
      "Refusing to push repository default branch",
    );
  }
}

/** In-memory fake for CI — opens synthetic MRs. */
export class FakeGitlabDelivery implements ScmDeliveryClient {
  readonly mergeRequests = new Map<string, DeliverChangeRequestResult>();
  private seq = 2000;

  async deliverPullRequest(
    input: DeliverChangeRequestInput,
  ): Promise<DeliverChangeRequestResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    const existing = this.mergeRequests.get(input.idempotencyKey);
    if (existing) return { ...existing, created: false };

    this.seq += 1;
    const path =
      input.repo.fullPath ?? `${input.repo.owner}/${input.repo.repo}`;
    const result: DeliverChangeRequestResult = {
      branchName: input.branchName,
      headSha: `glfake${this.seq.toString(16)}`,
      prNumber: this.seq,
      prUrl: `https://gitlab.example/${path}/-/merge_requests/${this.seq}`,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
    this.mergeRequests.set(input.idempotencyKey, result);
    return result;
  }
}

type FetchLike = typeof fetch;

/**
 * Real GitLab API delivery via personal/project/group access token or OAuth token.
 * Creates a branch + commit via commits API, then opens a Merge Request.
 */
export class HttpGitlabDelivery implements ScmDeliveryClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    private readonly projectId: string | number,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async deliverPullRequest(
    input: DeliverChangeRequestInput,
  ): Promise<DeliverChangeRequestResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    if (!input.files.length) {
      throw new GitlabDeliveryError("invalid", "files required");
    }

    const base = normalizeGitlabBaseUrl(this.baseUrl);
    const projectPath = encodeURIComponent(String(this.projectId));
    const api = `${base}/api/v4/projects/${projectPath}`;

    const existingMr = await this.findOpenMr(api, input.branchName);
    if (existingMr) {
      return {
        branchName: input.branchName,
        headSha: existingMr.sha,
        prNumber: existingMr.iid,
        prUrl: existingMr.webUrl,
        created: false,
        idempotencyKey: input.idempotencyKey,
      };
    }

    const actions = input.files.map((f) => ({
      action: "create" as const,
      file_path: f.path,
      content:
        f.encoding === "base64"
          ? Buffer.from(f.content, "base64").toString("utf8")
          : f.content,
    }));

    // Create branch from baseSha tip via commit that also starts the branch.
    const commitRes = await this.fetchImpl(`${api}/repository/commits`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        branch: input.branchName,
        start_branch: input.repo.defaultBranch,
        commit_message: input.commitMessage,
        actions,
      }),
    });

    if (!commitRes.ok) {
      const text = await commitRes.text();
      // Retry as update if files already exist on branch
      if (commitRes.status === 400 && text.includes("A file with this name already exists")) {
        const updateActions = input.files.map((f) => ({
          action: "update" as const,
          file_path: f.path,
          content:
            f.encoding === "base64"
              ? Buffer.from(f.content, "base64").toString("utf8")
              : f.content,
        }));
        const retry = await this.fetchImpl(`${api}/repository/commits`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            branch: input.branchName,
            commit_message: input.commitMessage,
            actions: updateActions,
          }),
        });
        if (!retry.ok) {
          throw new GitlabDeliveryError(
            "http",
            `GitLab commit failed (${retry.status}): ${await retry.text()}`,
          );
        }
        const commit = (await retry.json()) as { id: string };
        return this.openMr(api, input, commit.id);
      }
      throw new GitlabDeliveryError(
        "http",
        `GitLab commit failed (${commitRes.status}): ${text}`,
      );
    }

    const commit = (await commitRes.json()) as { id: string };
    return this.openMr(api, input, commit.id);
  }

  private headers(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": this.token,
      Authorization: `Bearer ${this.token}`,
    };
  }

  private async findOpenMr(
    api: string,
    sourceBranch: string,
  ): Promise<{ iid: number; webUrl: string; sha: string } | null> {
    const url = new URL(`${api}/merge_requests`);
    url.searchParams.set("state", "opened");
    url.searchParams.set("source_branch", sourceBranch);
    const res = await this.fetchImpl(url.toString(), {
      headers: this.headers(),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{
      iid: number;
      web_url: string;
      sha?: string;
    }>;
    const first = list[0];
    if (!first) return null;
    return {
      iid: first.iid,
      webUrl: first.web_url,
      sha: first.sha ?? "unknown",
    };
  }

  private async openMr(
    api: string,
    input: DeliverChangeRequestInput,
    headSha: string,
  ): Promise<DeliverChangeRequestResult> {
    const res = await this.fetchImpl(`${api}/merge_requests`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        source_branch: input.branchName,
        target_branch: input.repo.defaultBranch,
        title: input.prTitle,
        description: input.prBody,
        remove_source_branch: false,
      }),
    });
    if (!res.ok) {
      throw new GitlabDeliveryError(
        "http",
        `GitLab MR create failed (${res.status}): ${await res.text()}`,
      );
    }
    const mr = (await res.json()) as {
      iid: number;
      web_url: string;
    };
    return {
      branchName: input.branchName,
      headSha,
      prNumber: mr.iid,
      prUrl: mr.web_url,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
  }
}
