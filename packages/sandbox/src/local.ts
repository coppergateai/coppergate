import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  assertEgressAllowed,
  DEFAULT_LIMITS,
  METADATA_IPV4,
  SandboxPolicyError,
} from "./policy.js";
import type {
  CreateSandboxInput,
  ExecResult,
  SandboxHandle,
  SandboxManager,
} from "./types.js";

type ActiveSandbox = SandboxHandle & { destroyed: boolean };

/**
 * Filesystem sandbox for CI/local demos (no Docker required).
 * Still enforces egress + lifecycle policy used by gVisor path.
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

    const root = this.options?.rootDir ?? tmpdir();
    const workdir = await mkdtemp(join(root, "cg-sandbox-"));
    const id = `local_${createHash("sha256")
      .update(`${input.runId}:${Date.now()}`)
      .digest("hex")
      .slice(0, 16)}`;

    // Simulate clone-at-SHA: materialize a minimal tree pinned to baseSha.
    await mkdir(join(workdir, ".git"), { recursive: true });
    await writeFile(
      join(workdir, ".git", "HEAD"),
      `ref: refs/heads/${input.branchName ?? "coppergate-work"}\n`,
      "utf8",
    );
    await writeFile(
      join(workdir, "README.md"),
      `# Sandbox clone\n\nbaseSha=${input.baseSha}\nrepo=${input.repoUrl}\n`,
      "utf8",
    );
    await writeFile(
      join(workdir, ".coppergate-sandbox.json"),
      JSON.stringify(
        {
          id,
          runId: input.runId,
          workspaceId: input.workspaceId,
          baseSha: input.baseSha,
          repoUrl: input.repoUrl,
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
      destroyed: false,
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

    // Policy probe: refuse commands that target metadata / disallowed URLs.
    for (const arg of command) {
      if (arg.includes(METADATA_IPV4) || /169\.254\.\d+\.\d+/.test(arg)) {
        throw new SandboxPolicyError(
          "egress_denied",
          "Cannot reach cloud metadata IP from sandbox",
        );
      }
      const urlHost = arg.match(/^https?:\/\/([^/:]+)/i)?.[1];
      if (urlHost) {
        assertEgressAllowed(urlHost);
      }
    }

    const timeoutMs =
      options?.timeoutMs ??
      DEFAULT_LIMITS.wallClockMs;

    return runCommand(command, active.workdir, timeoutMs);
  }

  async destroy(sandbox: SandboxHandle): Promise<void> {
    const active = this.active.get(sandbox.id);
    if (!active || active.destroyed) {
      // Idempotent destroy
      await rm(sandbox.workdir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      return;
    }
    active.destroyed = true;
    this.active.delete(sandbox.id);
    await rm(active.workdir, { recursive: true, force: true });
  }

  /** Test helper: whether workdir still exists. */
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
