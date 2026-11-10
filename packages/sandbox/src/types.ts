/**
 * SandboxManager port — ARCHITECTURE D5 / TASK019.
 */

export type SandboxLimits = {
  /** Millicores-ish CPU share (relative). */
  cpuShares: number;
  memoryMb: number;
  pidsMax: number;
  diskMb: number;
  wallClockMs: number;
};

export type SandboxCloneMode = "sim" | "git";

export type CreateSandboxInput = {
  runId: string;
  workspaceId: string;
  /** Arena prod_writes_enabled — allows production deploy commands (SEC-036). */
  prodWritesEnabled?: boolean;
  /** Repo clone URL or local path for fixtures. */
  repoUrl: string;
  /** Pinned commit SHA. */
  baseSha: string;
  /** Optional branch name for working tree metadata. */
  branchName?: string;
  limits?: Partial<SandboxLimits>;
  /**
   * sim = minimal fixture tree (CI/demo).
   * git = shallow clone + checkout baseSha (requires authToken for private repos).
   */
  cloneMode?: SandboxCloneMode;
  /** Installation / PAT token for private git clone (never logged). */
  authToken?: string | null;
};

export type SandboxHandle = {
  id: string;
  runId: string;
  workspaceId: string;
  /** Absolute workdir with cloned tree. */
  workdir: string;
  baseSha: string;
  createdAt: Date;
  /** Implementation kind. */
  runtime: "local" | "docker-gvisor";
  /** How the tree was materialized. */
  cloneMode?: SandboxCloneMode;
  prodWritesEnabled?: boolean;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export interface SandboxManager {
  create(input: CreateSandboxInput): Promise<SandboxHandle>;
  /** Run a command inside the sandbox workdir (policy-gated). */
  exec(
    sandbox: SandboxHandle,
    command: string[],
    options?: { timeoutMs?: number; hardDeadlineMs?: number },
  ): Promise<ExecResult>;
  destroy(sandbox: SandboxHandle): Promise<void>;
}
