/**
 * Branch + PR delivery — TASK021 / FR-05.
 * Never pushes the repository default branch.
 */

export class GithubDeliveryError extends Error {
  readonly code:
    | "policy"
    | "not_found"
    | "conflict"
    | "http"
    | "invalid";

  constructor(code: GithubDeliveryError["code"], message: string) {
    super(message);
    this.name = "GithubDeliveryError";
    this.code = code;
  }
}

export type RepoRef = {
  owner: string;
  repo: string;
  /** Default branch name (main/master/…). */
  defaultBranch: string;
};

export type FileChange = {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

export type DeliverPrInput = {
  repo: RepoRef;
  /** Must not equal defaultBranch. */
  branchName: string;
  baseSha: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  files: FileChange[];
  /** Suppress duplicate PR for same head branch. */
  idempotencyKey: string;
};

export type DeliverPrResult = {
  branchName: string;
  headSha: string;
  prNumber: number;
  prUrl: string;
  created: boolean;
  idempotencyKey: string;
};

export interface GithubDeliveryClient {
  deliverPullRequest(input: DeliverPrInput): Promise<DeliverPrResult>;
}

export function assertSafeBranch(
  branchName: string,
  defaultBranch: string,
): void {
  const branch = branchName.trim();
  const def = defaultBranch.trim();
  if (!branch) {
    throw new GithubDeliveryError("invalid", "branchName is required");
  }
  if (!def) {
    throw new GithubDeliveryError("invalid", "defaultBranch is required");
  }
  if (branch === def) {
    throw new GithubDeliveryError(
      "policy",
      "Refusing to push repository default branch",
    );
  }
  const forbidden = new Set(["main", "master", "production", "prod"]);
  if (forbidden.has(branch.toLowerCase()) && branch.toLowerCase() === def.toLowerCase()) {
    throw new GithubDeliveryError(
      "policy",
      "Refusing to push repository default branch",
    );
  }
  // Extra guard: never allow updating refs/heads/<default>
  if (branch === `refs/heads/${def}` || branch.startsWith("refs/heads/") && branch.slice("refs/heads/".length) === def) {
    throw new GithubDeliveryError(
      "policy",
      "Refusing to push repository default branch",
    );
  }
}

/** In-memory fake for CI — no network, no default-branch writes. */
export class FakeGithubDelivery implements GithubDeliveryClient {
  readonly pushes: Array<{ branch: string; sha: string; files: string[] }> = [];
  readonly pullRequests = new Map<string, DeliverPrResult>();
  private seq = 1000;

  async deliverPullRequest(input: DeliverPrInput): Promise<DeliverPrResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    if (!input.baseSha.trim()) {
      throw new GithubDeliveryError("invalid", "baseSha is required");
    }
    if (!input.files.length) {
      throw new GithubDeliveryError("invalid", "files required");
    }

    const existing = this.pullRequests.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, created: false };
    }

    // Also idempotent on head branch for same repo
    for (const pr of this.pullRequests.values()) {
      if (
        pr.branchName === input.branchName &&
        pr.idempotencyKey.startsWith(`${input.repo.owner}/${input.repo.repo}:`)
      ) {
        return { ...pr, created: false };
      }
    }

    const headSha = `fake${createShortHash(input.idempotencyKey + input.baseSha)}`;
    this.pushes.push({
      branch: input.branchName,
      sha: headSha,
      files: input.files.map((f) => f.path),
    });

    if (this.pushes.some((p) => p.branch === input.repo.defaultBranch)) {
      throw new GithubDeliveryError(
        "policy",
        "Internal error: attempted default branch push",
      );
    }

    this.seq += 1;
    const result: DeliverPrResult = {
      branchName: input.branchName,
      headSha,
      prNumber: this.seq,
      prUrl: `https://github.com/${input.repo.owner}/${input.repo.repo}/pull/${this.seq}`,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
    this.pullRequests.set(input.idempotencyKey, result);
    return result;
  }
}

function createShortHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0").slice(0, 40);
}

type FetchLike = typeof fetch;

/**
 * Real GitHub Contents/Git/PR API delivery via installation token.
 * Still refuses default-branch pushes before any HTTP write.
 */
export class HttpGithubDelivery implements GithubDeliveryClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async deliverPullRequest(input: DeliverPrInput): Promise<DeliverPrResult> {
    assertSafeBranch(input.branchName, input.repo.defaultBranch);
    const { owner, repo } = input.repo;

    // Idempotency: existing open PR with same head
    const existing = await this.findPrByHead(owner, repo, input.branchName);
    if (existing) {
      return { ...existing, created: false, idempotencyKey: input.idempotencyKey };
    }

    if (!input.files.length) {
      throw new GithubDeliveryError("invalid", "files required");
    }

    // Ensure branch ref from baseSha
    await this.createRef(owner, repo, input.branchName, input.baseSha);

    // One Git Data commit for all files — Contents API PUT-per-file was
    // creating N near-identical commits (thrash) with the same message.
    const headSha = await this.commitFilesOnBranch(
      owner,
      repo,
      input.branchName,
      input.repo.defaultBranch,
      input.files,
      input.commitMessage,
      input.baseSha,
    );

    const pr = await this.createPr(owner, repo, {
      title: input.prTitle,
      body: input.prBody,
      head: input.branchName,
      base: input.repo.defaultBranch,
    });

    if (!pr.created) {
      return {
        branchName: pr.branchName ?? input.branchName,
        headSha: pr.headSha ?? headSha,
        prNumber: pr.number,
        prUrl: pr.html_url,
        created: false,
        idempotencyKey: input.idempotencyKey,
      };
    }

    return {
      branchName: input.branchName,
      headSha,
      prNumber: pr.number,
      prUrl: pr.html_url,
      created: true,
      idempotencyKey: input.idempotencyKey,
    };
  }

  private async findPrByHead(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<Omit<DeliverPrResult, "created" | "idempotencyKey"> | null> {
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${branch}`,
      { headers: this.headers() },
    );
    // Fail closed: a list blip must not be treated as "no PR" (duplicate create risk).
    if (!res.ok) {
      throw new GithubDeliveryError(
        "http",
        `findPrByHead failed (${res.status})`,
      );
    }
    const list = (await res.json()) as Array<{
      number: number;
      html_url: string;
      head: { sha: string; ref: string };
    }>;
    const hit = list[0];
    if (!hit) return null;
    return {
      branchName: hit.head.ref,
      headSha: hit.head.sha,
      prNumber: hit.number,
      prUrl: hit.html_url,
    };
  }

  private async createRef(
    owner: string,
    repo: string,
    branch: string,
    sha: string,
  ): Promise<void> {
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      },
    );
    if (res.status === 422) {
      // Already exists — ok for idempotent retry
      return;
    }
    if (!res.ok) {
      throw new GithubDeliveryError(
        "http",
        `createRef failed (${res.status})`,
      );
    }
  }

  private async getBranchHeadSha(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string | null> {
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
      { headers: this.headers() },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new GithubDeliveryError(
        "http",
        `getBranchHeadSha failed (${res.status})`,
      );
    }
    const body = (await res.json()) as { object?: { sha?: string } };
    return body.object?.sha ?? null;
  }

  /**
   * Batch all file changes into a single commit via the Git Data API.
   * Compare-and-swap: refuses to update the ref if the tip moved.
   */
  private async commitFilesOnBranch(
    owner: string,
    repo: string,
    branch: string,
    defaultBranch: string,
    files: FileChange[],
    message: string,
    expectedHead: string,
  ): Promise<string> {
    assertSafeBranch(branch, defaultBranch);

    const tip = await this.getBranchHeadSha(owner, repo, branch);
    const parentSha = tip ?? expectedHead;
    if (
      expectedHead &&
      expectedHead !== "unknown" &&
      tip &&
      tip !== expectedHead
    ) {
      throw new GithubDeliveryError(
        "conflict",
        `branch head moved: expected ${expectedHead.slice(0, 12)} got ${tip.slice(0, 12)}`,
      );
    }

    const parentRes = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${parentSha}`,
      { headers: this.headers() },
    );
    if (!parentRes.ok) {
      throw new GithubDeliveryError(
        "http",
        `getCommit failed (${parentRes.status})`,
      );
    }
    const parent = (await parentRes.json()) as {
      tree?: { sha?: string };
    };
    const baseTree = parent.tree?.sha;
    if (!baseTree) {
      throw new GithubDeliveryError("http", "parent commit missing tree sha");
    }

    const treeItems: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string;
    }> = [];
    for (const file of files) {
      const encoding = file.encoding === "base64" ? "base64" : "utf-8";
      const blobRes = await this.fetchImpl(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            content: file.content,
            encoding,
          }),
        },
      );
      if (!blobRes.ok) {
        throw new GithubDeliveryError(
          "http",
          `createBlob failed (${blobRes.status}) for ${file.path}`,
        );
      }
      const blob = (await blobRes.json()) as { sha?: string };
      if (!blob.sha) {
        throw new GithubDeliveryError(
          "http",
          `createBlob missing sha for ${file.path}`,
        );
      }
      treeItems.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const treeRes = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          base_tree: baseTree,
          tree: treeItems,
        }),
      },
    );
    if (!treeRes.ok) {
      throw new GithubDeliveryError(
        "http",
        `createTree failed (${treeRes.status})`,
      );
    }
    const tree = (await treeRes.json()) as { sha?: string };
    if (!tree.sha) {
      throw new GithubDeliveryError("http", "createTree missing sha");
    }

    const commitRes = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          message,
          tree: tree.sha,
          parents: [parentSha],
        }),
      },
    );
    if (!commitRes.ok) {
      throw new GithubDeliveryError(
        "http",
        `createCommit failed (${commitRes.status})`,
      );
    }
    const commit = (await commitRes.json()) as { sha?: string };
    if (!commit.sha) {
      throw new GithubDeliveryError("http", "createCommit missing sha");
    }

    // Final CAS before moving the tip.
    const tipAgain = await this.getBranchHeadSha(owner, repo, branch);
    if (tipAgain && tipAgain !== parentSha) {
      throw new GithubDeliveryError(
        "conflict",
        `branch head moved: expected ${parentSha.slice(0, 12)} got ${tipAgain.slice(0, 12)}`,
      );
    }

    const refRes = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ sha: commit.sha, force: false }),
      },
    );
    if (refRes.status === 422) {
      throw new GithubDeliveryError(
        "conflict",
        `updateRef conflict (422) for ${branch}`,
      );
    }
    if (!refRes.ok) {
      throw new GithubDeliveryError(
        "http",
        `updateRef failed (${refRes.status})`,
      );
    }
    return commit.sha;
  }

  private async createPr(
    owner: string,
    repo: string,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<{
    number: number;
    html_url: string;
    created: boolean;
    branchName?: string;
    headSha?: string;
  }> {
    if (input.head === input.base) {
      throw new GithubDeliveryError(
        "policy",
        "PR head must not equal base (default) branch",
      );
    }
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(input),
      },
    );
    if (res.status === 422) {
      // Another worker / prior attempt already opened the PR — recover via list.
      const existing = await this.findPrByHead(owner, repo, input.head);
      if (existing) {
        return {
          number: existing.prNumber,
          html_url: existing.prUrl,
          created: false,
          branchName: existing.branchName,
          headSha: existing.headSha,
        };
      }
      throw new GithubDeliveryError(
        "http",
        "createPr failed (422) and no existing PR found for head",
      );
    }
    if (!res.ok) {
      throw new GithubDeliveryError(
        "http",
        `createPr failed (${res.status})`,
      );
    }
    const body = (await res.json()) as { number: number; html_url: string };
    return { ...body, created: true };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "coppergate-github-delivery",
    };
  }
}
