import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { assertSandboxCommandArgs } from "./command-policy.js";
import { DEFAULT_LIMITS, SandboxPolicyError } from "./policy.js";
import type {
  CreateSandboxInput,
  ExecResult,
  SandboxCloneMode,
  SandboxHandle,
  SandboxManager,
} from "./types.js";

type ActiveSandbox = SandboxHandle & { destroyed: boolean };

/**
 * Filesystem sandbox for CI/local/staging.
 * - cloneMode=sim: minimal fixture tree (no network).
 * - cloneMode=git: shallow clone + checkout baseSha (real repo tree).
 */
export class LocalSandboxManager implements SandboxManager {
  private readonly active = new Map<string, ActiveSandbox>();

  constructor(
    private readonly options?: {
      rootDir?: string;
    },
  ) {}

  async create(input: CreateSandboxInput): Promise<SandboxHandle> {
    if (!input.baseSha.trim()) {
      throw new SandboxPolicyError("invalid", "baseSha is required");
    }
    if (!input.runId.trim() || !input.workspaceId.trim()) {
      throw new SandboxPolicyError("invalid", "runId and workspaceId required");
    }

    const cloneMode: SandboxCloneMode = input.cloneMode ?? "sim";
    const root = this.options?.rootDir ?? tmpdir();
    const workdir = await mkdtemp(join(root, "cg-sandbox-"));
    const id = `local_${createHash("sha256")
      .update(`${input.runId}:${Date.now()}`)
      .digest("hex")
      .slice(0, 16)}`;

    if (cloneMode === "git") {
      await this.gitCloneCheckout(workdir, input);
    } else {
      await this.materializeSimTree(workdir, input);
    }

    await writeFile(
      join(workdir, ".coppergate-sandbox.json"),
      JSON.stringify(
        {
          id,
          runId: input.runId,
          workspaceId: input.workspaceId,
          baseSha: input.baseSha,
          repoUrl: redactRepoUrl(input.repoUrl),
          cloneMode,
          limits: { ...DEFAULT_LIMITS, ...input.limits },
          runtime: "local",
        },
        null,
        2,
      ),
      "utf8",
    );

    const handle: ActiveSandbox = {
      id,
      runId: input.runId,
      workspaceId: input.workspaceId,
      workdir,
      baseSha: input.baseSha,
      createdAt: new Date(),
      runtime: "local",
      cloneMode,
      destroyed: false,
    };
    this.active.set(id, handle);
    return { ...handle };
  }

  private async materializeSimTree(
    workdir: string,
    input: CreateSandboxInput,
  ): Promise<void> {
    await mkdir(join(workdir, ".git"), { recursive: true });
    await writeFile(
      join(workdir, ".git", "HEAD"),
      `ref: refs/heads/${input.branchName ?? "coppergate-work"}\n`,
      "utf8",
    );
    await writeFile(
      join(workdir, "README.md"),
      `# Sandbox clone\n\nbaseSha=${input.baseSha}\nrepo=${redactRepoUrl(input.repoUrl)}\n`,
      "utf8",
    );
  }

  private async gitCloneCheckout(
    workdir: string,
    input: CreateSandboxInput,
  ): Promise<void> {
    const url = authenticatedCloneUrl(input.repoUrl, input.authToken);
    const clone = await runCommand(
      [
        "git",
        "clone",
        "--depth",
        "50",
        "--no-tags",
        url,
        workdir,
      ],
      process.cwd(),
      Math.min(DEFAULT_LIMITS.wallClockMs, 120_000),
    );
    if (clone.exitCode !== 0) {
      throw new SandboxPolicyError(
        "invalid",
        `git clone failed: ${clone.stderr.slice(0, 400)}`,
      );
    }

    const sha = input.baseSha.trim();
    if (sha && sha !== "unknown" && !/^0+$/.test(sha)) {
      const fetch = await runCommand(
        ["git", "fetch", "--depth", "1", "origin", sha],
        workdir,
        60_000,
      );
      if (fetch.exitCode === 0) {
        const co = await runCommand(
          ["git", "checkout", "--force", sha],
          workdir,
          30_000,
        );
        if (co.exitCode !== 0) {
          throw new SandboxPolicyError(
            "invalid",
            `git checkout ${sha} failed: ${co.stderr.slice(0, 300)}`,
          );
        }
      } else {
        // Fall back to default HEAD if SHA not fetchable (shallow).
        const co = await runCommand(
          ["git", "checkout", "--force", "HEAD"],
          workdir,
          30_000,
        );
        if (co.exitCode !== 0) {
          throw new SandboxPolicyError(
            "invalid",
            `git checkout HEAD failed: ${co.stderr.slice(0, 300)}`,
          );
        }
      }
    }
  }

  async exec(
    sandbox: SandboxHandle,
    command: string[],
    options?: { timeoutMs?: number },
  ): Promise<ExecResult> {
    const active = this.requireActive(sandbox.id);
    if (!command.length) {
      throw new SandboxPolicyError("invalid", "command required");
    }

    assertSandboxCommandArgs(command);

    const timeoutMs = options?.timeoutMs ?? DEFAULT_LIMITS.wallClockMs;
    return runCommand(command, active.workdir, timeoutMs);
  }

  async destroy(sandbox: SandboxHandle): Promise<void> {
    const active = this.active.get(sandbox.id);
    if (!active || active.destroyed) {
      await rm(sandbox.workdir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      return;
    }
    active.destroyed = true;
    this.active.delete(sandbox.id);
    await rm(active.workdir, { recursive: true, force: true });
  }

  async isDestroyed(sandbox: SandboxHandle): Promise<boolean> {
    const active = this.active.get(sandbox.id);
    if (active && !active.destroyed) return false;
    try {
      await readFile(join(sandbox.workdir, ".coppergate-sandbox.json"));
      return false;
    } catch {
      return true;
    }
  }

  private requireActive(id: string): ActiveSandbox {
    const active = this.active.get(id);
    if (!active || active.destroyed) {
      throw new SandboxPolicyError("destroyed", "Sandbox already destroyed");
    }
    return active;
  }
}

function redactRepoUrl(url: string): string {
  return url.replace(/https:\/\/[^@]+@/i, "https://***@");
}

function authenticatedCloneUrl(
  repoUrl: string,
  token: string | null | undefined,
): string {
  const trimmed = repoUrl.trim();
  if (!token?.trim()) return trimmed;
  if (trimmed.startsWith("https://github.com/")) {
    return trimmed.replace(
      "https://github.com/",
      `https://x-access-token:${encodeURIComponent(token)}@github.com/`,
    );
  }
  if (trimmed.startsWith("https://")) {
    return trimmed.replace(
      "https://",
      `https://oauth2:${encodeURIComponent(token)}@`,
    );
  }
  return trimmed;
}

function runCommand(
  command: string[],
  cwd: string,
  timeoutMs: number,
): Promise<ExecResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: cwd,
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.slice(0, 64_000),
        stderr: stderr.slice(0, 64_000),
        durationMs: Date.now() - started,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 127,
        stdout,
        stderr: err.message,
        durationMs: Date.now() - started,
      });
    });
  });
}
