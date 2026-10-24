import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { assertSandboxCommandArgs } from "./command-policy.js";
import { buildDockerSandboxSpec } from "./docker-spec.js";
import {
  DEFAULT_LIMITS,
  SandboxPolicyError,
} from "./policy.js";
import type {
  CreateSandboxInput,
  ExecResult,
  SandboxCloneMode,
  SandboxHandle,
  SandboxManager,
} from "./types.js";

type ActiveSandbox = SandboxHandle & { destroyed: boolean; image: string };

/**
 * Docker + gVisor (runsc) sandbox manager.
 * Materializes the workdir on the host, then runs commands inside a
 * policy-hardened container (no docker.sock, network none, cap-drop ALL).
 */
export class DockerSandboxManager implements SandboxManager {
  private readonly active = new Map<string, ActiveSandbox>();

  constructor(
    private readonly options?: {
      rootDir?: string;
      image?: string;
      /** Prefer runsc; fall back to runc when runsc unavailable. Default true. */
      preferRunsc?: boolean;
      /** Inject for tests. */
      dockerExec?: (
        args: string[],
        options?: { timeoutMs?: number },
      ) => Promise<ExecResult>;
    },
  ) {}

  async create(input: CreateSandboxInput): Promise<SandboxHandle> {
    if (!input.baseSha.trim()) {
      throw new SandboxPolicyError("invalid", "baseSha is required");
    }
    if (!input.runId.trim() || !input.workspaceId.trim()) {
      throw new SandboxPolicyError("invalid", "runId and workspaceId required");
    }

    await this.assertDockerAvailable();

    const cloneMode: SandboxCloneMode = input.cloneMode ?? "sim";
    const root = this.options?.rootDir ?? tmpdir();
    const workdir = await mkdtemp(join(root, "cg-sandbox-docker-"));
    const id = `docker_${createHash("sha256")
      .update(`${input.runId}:${Date.now()}`)
      .digest("hex")
      .slice(0, 16)}`;

    if (cloneMode === "git") {
      await this.gitCloneCheckout(workdir, input);
    } else {
      await this.materializeSimTree(workdir, input);
    }

    const spec = buildDockerSandboxSpec({
      image: this.options?.image,
      workdirHostPath: workdir,
      baseSha: input.baseSha,
      limits: input.limits,
    });

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
          runtime: "docker-gvisor",
          image: spec.image,
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
      runtime: "docker-gvisor",
      cloneMode,
      destroyed: false,
      image: spec.image,
    };
    this.active.set(id, handle);
    return { ...handle };
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

    const spec = buildDockerSandboxSpec({
      image: active.image,
      workdirHostPath: active.workdir,
      baseSha: active.baseSha,
    });
    const runtime = await this.resolveRuntime();
    const dockerArgs = [
      "run",
      "--rm",
      `--runtime=${runtime}`,
      `--network=${spec.networkMode}`,
      `--user=${spec.user}`,
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--workdir=/workspace",
      `-v=${active.workdir}:/workspace:rw`,
      ...spec.capDrop.flatMap((c) => ["--cap-drop", c]),
      ...spec.securityOpt.flatMap((o) => ["--security-opt", o]),
      `--memory=${spec.limits.memoryMb}m`,
      `--pids-limit=${spec.limits.pidsMax}`,
      "--env",
      `COPPERGATE_BASE_SHA=${active.baseSha}`,
      "--env",
      "HOME=/tmp",
      "--env",
      "GIT_TERMINAL_PROMPT=0",
      spec.image,
      ...command,
    ];

    const timeoutMs = options?.timeoutMs ?? DEFAULT_LIMITS.wallClockMs;
    if (this.options?.dockerExec) {
      return this.options.dockerExec(dockerArgs, { timeoutMs });
    }
    return runHostCommand(["docker", ...dockerArgs], timeoutMs);
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

  private async assertDockerAvailable(): Promise<void> {
    if (this.options?.dockerExec) return;
    const probe = await runHostCommand(["docker", "version", "--format", "{{.Server.Version}}"], 8_000);
    if (probe.exitCode !== 0) {
      throw new SandboxPolicyError(
        "invalid",
        "Docker is required for SANDBOX_MODE=docker but is unavailable",
      );
    }
  }

  private async resolveRuntime(): Promise<"runsc" | "runc"> {
    if (this.options?.preferRunsc === false) return "runc";
    if (this.options?.dockerExec) return "runsc";
    const probe = await runHostCommand(
      ["docker", "info", "--format", "{{.Runtimes}}"],
      8_000,
    );
    if (probe.exitCode === 0 && /runsc/i.test(probe.stdout + probe.stderr)) {
      return "runsc";
    }
    return "runc";
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
    const clone = await runHostCommand(
      ["git", "clone", "--depth", "50", "--no-tags", url, workdir],
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
      const fetch = await runHostCommand(
        ["git", "fetch", "--depth", "1", "origin", sha],
        60_000,
        workdir,
      );
      if (fetch.exitCode === 0) {
        const co = await runHostCommand(
          ["git", "checkout", "--force", sha],
          30_000,
          workdir,
        );
        if (co.exitCode !== 0) {
          throw new SandboxPolicyError(
            "invalid",
            `git checkout ${sha} failed: ${co.stderr.slice(0, 300)}`,
          );
        }
      }
    }
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

function runHostCommand(
  command: string[],
  timeoutMs: number,
  cwd?: string,
): Promise<ExecResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
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
