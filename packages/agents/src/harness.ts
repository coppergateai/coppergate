import type { AgentEvent, AgentRunInput, CodingAgent } from "./types.js";
import { FakeCodingAgent } from "./fake.js";
import {
  OpenAiCompatibleCodingAgent,
  type OpenAiCompatibleConfig,
} from "./openai-compatible.js";
import { harnessStubAllowed } from "./stub-detect.js";

/**
 * ContenderHarness port (TASK113) — external coding runtimes as arena backends.
 * CodingAgent remains the native path; harnesses adapt to the same event stream.
 */
export type ContenderHarnessKind =
  | "native_fake"
  | "native_openai"
  | "openhands"
  | "aider"
  | "cursor_cloud"
  | "codex";

export type ContenderHarness = {
  readonly kind: ContenderHarnessKind;
  /** Human-readable capability note for docs / UI. */
  readonly capability: string;
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
};

export class NativeFakeHarness implements ContenderHarness {
  readonly kind = "native_fake" as const;
  readonly capability = "Deterministic FakeCodingAgent (CI / demos)";
  private readonly agent = new FakeCodingAgent();
  run(input: AgentRunInput) {
    return this.agent.run(input);
  }
}

export class NativeOpenAiHarness implements ContenderHarness {
  readonly kind = "native_openai" as const;
  readonly capability = "OpenAI-compatible CodingAgent";
  constructor(private readonly agent: CodingAgent) {}
  run(input: AgentRunInput) {
    return this.agent.run(input);
  }
}

/**
 * OpenHands / Aider harness — real runtime not wired in-process.
 * Refuses stub scaffold writes unless ALLOW_HARNESS_STUB=1 (dev only).
 */
export class OpenHandsSandboxHarness implements ContenderHarness {
  readonly kind = "openhands" as const;
  readonly capability =
    "OpenHands BYO — requires real runtime; stub disabled by default";

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    if (!harnessStubAllowed()) {
      yield {
        kind: "error",
        message:
          "OpenHands/Aider stub harness disabled. Configure workspace BYOK (native OpenAI-compatible) or set ALLOW_HARNESS_STUB=1 for local demos only.",
        payload: {
          code: "harness_stub_disabled",
          harness: this.kind,
          hint: "native_openai_byok",
        },
      };
      return;
    }

    // Legacy stub path — only with explicit opt-in (tests / demos).
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");
    const { buildFakeCompletion } = await import("./fake.js");

    const workdir = input.sandboxWorkdir?.trim();
    if (!workdir) {
      yield {
        kind: "progress",
        message:
          "OpenHands harness stub — no sandbox workdir; FakeCodingAgent fallback",
        payload: { harness: this.kind, status: "no_sandbox" },
      };
      yield* new FakeCodingAgent().run(input);
      return;
    }

    yield {
      kind: "progress",
      message: "OpenHands harness stub — applying fix in sandbox (ALLOW_HARNESS_STUB)",
      payload: {
        harness: this.kind,
        status: "sandbox",
        sandboxId: input.sandboxId ?? null,
      },
    };

    const relPath = resolveHarnessWritePath(input.allowedPaths);
    const absPath = join(workdir, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    const goalOneLine = input.goal.slice(0, 160).replace(/\n/g, " ");
    const body = [
      `/**`,
      ` * Coppergate OpenHands sandbox fix`,
      ` * run: ${input.runId}`,
      ` * goal: ${goalOneLine}`,
      ` */`,
      `export function coppergateSignalFix() {`,
      `  return { runId: ${JSON.stringify(input.runId)}, ok: true };`,
      `}`,
      ``,
    ].join("\n");
    await writeFile(absPath, body, "utf8");

    yield {
      kind: "file",
      message: `wrote ${relPath}`,
      payload: { path: relPath, harness: this.kind },
    };

    const costMicros = Math.min(2_500, Math.max(500, input.spendCapMicros || 2_500));
    yield {
      kind: "cost",
      message: "OpenHands sandbox harness estimate",
      payload: {
        costMicros,
        harness: this.kind,
        provider: "openhands",
        model: "openhands-sandbox-v1",
      },
    };

    const completion = {
      ...buildFakeCompletion(input, costMicros),
      filesChanged: [relPath],
    };

    yield {
      kind: "completion",
      message: "OpenHands sandbox harness ready for validation/review",
      payload: completion as unknown as Record<string, unknown>,
    };
  }
}

/** @deprecated Use OpenHandsSandboxHarness — kept as alias for imports. */
export const OpenHandsHarnessStub = OpenHandsSandboxHarness;

/** Cursor Cloud / Codex stub (TASK115) — API wait-state. */
export class CursorCloudHarnessStub implements ContenderHarness {
  readonly kind = "cursor_cloud" as const;
  readonly capability =
    "Cursor Cloud Background Agents (stub) — awaiting public API; Fake fallback";
  private readonly fallback = new FakeCodingAgent();

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    if (!harnessStubAllowed()) {
      yield {
        kind: "error",
        message:
          "Cursor Cloud / Codex harness not available. Use workspace BYOK native OpenAI-compatible agent.",
        payload: { code: "harness_stub_disabled", harness: this.kind },
      };
      return;
    }
    yield {
      kind: "progress",
      message: "Cursor Cloud harness stub — using FakeCodingAgent fallback",
      payload: { harness: this.kind, status: "wait_api" },
    };
    yield* this.fallback.run(input);
  }
}

export type CreateHarnessOptions = {
  kind?: ContenderHarnessKind;
  openai?: OpenAiCompatibleConfig;
};

export function createContenderHarness(
  opts: CreateHarnessOptions = {},
): ContenderHarness {
  const kind = opts.kind ?? "native_fake";
  switch (kind) {
    case "native_openai":
      if (!opts.openai?.apiKey) {
        throw new Error("native_openai harness requires openai.apiKey");
      }
      return new NativeOpenAiHarness(
        new OpenAiCompatibleCodingAgent(opts.openai),
      );
    case "openhands":
    case "aider":
      return new OpenHandsSandboxHarness();
    case "cursor_cloud":
    case "codex":
      return new CursorCloudHarnessStub();
    case "native_fake":
    default:
      return new NativeFakeHarness();
  }
}

/** Adapt harness → CodingAgent for existing worker paths. */
export function harnessAsCodingAgent(harness: ContenderHarness): CodingAgent {
  return {
    kind: harness.kind,
    capability: harness.capability,
    run(input) {
      return harness.run(input);
    },
  } as CodingAgent & { kind: ContenderHarnessKind; capability: string };
}

function resolveHarnessWritePath(allowedPaths: string[]): string {
  const first = allowedPaths[0]?.trim();
  if (!first || first === "**/*" || first.includes("*")) {
    return "app/page.tsx";
  }
  return first.replace(/^\.\//, "");
}
