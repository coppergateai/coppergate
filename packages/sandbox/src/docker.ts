import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { assertSandboxCommandArgs } from "./command-policy.js";
import {
  authenticatedCloneUrl,
  scrubOriginCredentials,
} from "./clone-credentials.js";
import { buildDockerSandboxSpec } from "./docker-spec.js";
import { resolveSandboxExecTimeoutMs } from "./exec-timeout.js";
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

type ActiveSandbox = SandboxHandle & {
  destroyed: boolean;
  image: string;
  /** Host dir mounted at /cache (Go/npm/pnpm caches across execs). */
  cacheDir: string;
};

/**
 * Fetch-only commands that get registry egress (`--network=bridge`). Exact
 * argv match: they download packages but never run repository code. Every
 * other command (tests, lint, agent tools) stays on `--network=none`.
 */
const FETCH_ONLY_COMMANDS: readonly (readonly string[])[] = [
  ["pnpm", "install", "--lockfile-only", "--ignore-scripts"],
  ["npm", "install", "--package-lock-only", "--ignore-scripts"],
  ["yarn", "install", "--mode=update-lockfile"],
  ["go", "mod", "download"],
];

export function isFetchOnlyCommand(command: readonly string[]): boolean {
  return FETCH_ONLY_COMMANDS.some(
    (allowed) =>
      allowed.length === command.length &&
      allowed.every((arg, i) => arg === command[i]),
  );
}

/** Pin registries via env so repo .npmrc / .yarnrc.yml cannot redirect fetches. */
const EGRESS_ENV: Record<string, string> = {
  npm_config_registry: "https://registry.npmjs.org/",
  YARN_NPM_REGISTRY_SERVER: "https://registry.npmjs.org",
  GOPROXY: "https://proxy.golang.org",
};

const CACHE_ENV: Record<string, string> = {
  GOMODCACHE: "/cache/go/mod",
  GOCACHE: "/cache/go/build",
  GOTMPDIR: "/cache/tmp",
  GOTOOLCHAIN: "local",
  npm_config_cache: "/cache/npm",
  npm_config_store_dir: "/cache/pnpm-store",
  npm_config_manage_package_manager_versions: "false",
  YARN_CACHE_FOLDER: "/cache/yarn",
  XDG_CACHE_HOME: "/cache/xdg",
};

function defaultContainerUser(): string {
  // Run as the worker's own uid so the 0700 mkdtemp workdir is accessible.
  if (typeof process.getuid === "function" && typeof process.getgid === "function") {
    return `${process.getuid()}:${process.getgid()}`;
  }
  return "1000:1000";
}

/**
 * Docker + gVisor (runsc) sandbox manager.
 * Materializes the workdir on the host, then runs commands inside a
 * policy-hardened container (no docker.sock, network none, cap-drop ALL).
 */
export class DockerSandboxManager implements SandboxManager {
  private readonly active = new Map<string, ActiveSandbox>();
  private runtime: Promise<"runsc" | "runc"> | null = null;

  constructor(
    private readonly options?: {
      rootDir?: string;
      image?: string;
      /** Prefer runsc; fall back to runc when runsc unavailable. Default true. */
      preferRunsc?: boolean;
      /** Fail closed instead of falling back to runc (production). */
      requireRunsc?: boolean;
      /** Container uid:gid. Default: the worker's own uid:gid. */
      user?: string;
      /** Inject for tests. */
      dockerExec?: (
        args: string[],
        options?: { timeoutMs?: number; hardDeadlineMs?: number },
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
    await this.resolveRuntime();

    const cloneMode: SandboxCloneMode = input.cloneMode ?? "sim";
    const root = this.options?.rootDir ?? tmpdir();
    const workdir = await mkdtemp(join(root, "cg-sandbox-docker-"));
    const cacheDir = await mkdtemp(join(root, "cg-sandbox-docker-cache-"));
    await mkdir(join(cacheDir, "tmp"), { recursive: true });
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
      prodWritesEnabled: input.prodWritesEnabled === true,
      destroyed: false,
      image: spec.image,
      cacheDir,
    };
    this.active.set(id, handle);
    return { ...handle };
  }

  async exec(
    sandbox: SandboxHandle,
    command: string[],
    options?: { timeoutMs?: number; hardDeadlineMs?: number },
  ): Promise<ExecResult> {
    const active = this.requireActive(sandbox.id);
    if (!command.length) {
      throw new SandboxPolicyError("invalid", "command required");
    }
    assertSandboxCommandArgs(command, {
      prodWritesEnabled: active.prodWritesEnabled,
    });

    const spec = buildDockerSandboxSpec({
      image: active.image,
      workdirHostPath: active.workdir,
      baseSha: active.baseSha,
      user: this.options?.user ?? defaultContainerUser(),
    });
    const runtime = await this.resolveRuntime();
    const egress = isFetchOnlyCommand(command);
    const env: Record<string, string> = {
      COPPERGATE_BASE_SHA: active.baseSha,
      HOME: "/tmp",
      GIT_TERMINAL_PROMPT: "0",
      ...CACHE_ENV,
      ...(egress ? EGRESS_ENV : { GOPROXY: "off" }),
    };
    const dockerArgs = [
      "run",
      "--rm",
      `--runtime=${runtime}`,
      `--network=${egress ? "bridge" : spec.networkMode}`,
      `--user=${spec.user}`,
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--workdir=/workspace",
      `-v=${active.workdir}:/workspace:rw`,
      `-v=${active.cacheDir}:/cache:rw`,
      ...spec.capDrop.flatMap((c) => ["--cap-drop", c]),
      ...spec.securityOpt.flatMap((o) => ["--security-opt", o]),
      `--memory=${spec.limits.memoryMb}m`,
      `--pids-limit=${spec.limits.pidsMax}`,
      ...Object.entries(env).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
      spec.image,
      ...command,
    ];

    const timeoutMs = resolveSandboxExecTimeoutMs(options);
    if (this.options?.dockerExec) {
      return this.options.dockerExec(dockerArgs, {
        timeoutMs,
        hardDeadlineMs: options?.hardDeadlineMs,
      });
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
    await rm(active.cacheDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
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

  private resolveRuntime(): Promise<"runsc" | "runc"> {
    this.runtime ??= this.probeRuntime().catch((err: unknown) => {
      this.runtime = null;
      throw err;
    });
    return this.runtime;
  }

  private async probeRuntime(): Promise<"runsc" | "runc"> {
    const requireRunsc = this.options?.requireRunsc === true;
    if (this.options?.preferRunsc === false && !requireRunsc) return "runc";
    const probe = this.options?.dockerExec
      ? await this.options.dockerExec(["info", "--format", "{{json .Runtimes}}"])
      : await runHostCommand(
          ["docker", "info", "--format", "{{json .Runtimes}}"],
          8_000,
        );
    if (probe.exitCode === 0 && /runsc/i.test(probe.stdout)) {
      return "runsc";
    }
    if (requireRunsc) {
      throw new SandboxPolicyError(
        "invalid",
        "gVisor runtime (runsc) is required but not registered with the Docker daemon",
      );
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
    await scrubOriginCredentials(input.repoUrl, (cmd) =>
      runHostCommand(cmd, 30_000, workdir),
    );
    const sha = input.baseSha.trim();
    if (sha && sha !== "unknown" && !/^0+$/.test(sha)) {
      const fetch = await runHostCommand(
        ["git", "fetch", "--depth", "1", url, sha],
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

function killProcessTree(child: { pid?: number; kill: (sig?: NodeJS.Signals) => boolean }): void {
  try {
    if (child.pid && child.pid > 0) {
      process.kill(-child.pid, "SIGKILL");
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    child.kill("SIGKILL");
  } catch {
    /* already dead */
  }
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
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killProcessTree(child);
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
