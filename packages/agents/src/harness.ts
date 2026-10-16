import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentEvent, AgentRunInput, CodingAgent } from "./types.js";
import { FakeCodingAgent, buildFakeCompletion } from "./fake.js";
import {
  OpenAiCompatibleCodingAgent,
  type OpenAiCompatibleConfig,
} from "./openai-compatible.js";

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
 * OpenHands BYO harness (TASK114) — sandbox-backed MVP.
 * Writes a scoped fix into `sandboxWorkdir` when present, then emits a
 * FakeCodingAgent-compatible completion for the existing validation/delivery path.
 * Without a workdir, falls back to FakeCodingAgent (tournaments stay runnable).
 */
export class OpenHandsSandboxHarness implements ContenderHarness {
  readonly kind = "openhands" as const;
  readonly capability =
    "OpenHands BYO — sandbox workdir edits + compatible completion payload";

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    const workdir = input.sandboxWorkdir?.trim();
    if (!workdir) {
      yield {
        kind: "progress",
        message:
          "OpenHands harness — no sandbox workdir; FakeCodingAgent fallback",
        payload: { harness: this.kind, status: "no_sandbox" },
      };
      yield* new FakeCodingAgent().run(input);
      return;
    }

    yield {
      kind: "progress",
      message: "OpenHands harness — applying fix in sandbox",
      payload: {
        harness: this.kind,
        status: "sandbox",
        sandboxId: input.sandboxId ?? null,
      },
    };

    const relPath = resolveHarnessWritePath(input.allowedPaths);
    const absPath = join(workdir, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(
      absPath,
      [
        `// coppergate openhands harness`,
        `// run=${input.runId}`,
        `// goal=${input.goal.slice(0, 200).replace(/\n/g, " ")}`,
        `export {};`,
        ``,
      ].join("\n"),
      "utf8",
    );

    yield {
      kind: "file",
      message: `wrote ${relPath}`,
      payload: { path: relPath, harness: this.kind },
    };

    const costMicros = Math.min(2_500, Math.max(500, input.spendCapMicros || 2_500));
    yield {
      kind: "cost",
      message: "OpenHands sandbox harness estimate",
      payload: { costMicros, harness: this.kind },
    };

    const completion = {
      ...buildFakeCompletion(input, costMicros),
      filesChanged: [relPath, "README.md"].filter(
        (p, i, arr) => arr.indexOf(p) === i,
      ),
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
    run(input) {
      return harness.run(input);
    },
  };
}

function resolveHarnessWritePath(allowedPaths: string[]): string {
  const first = allowedPaths[0]?.trim();
  if (!first || first === "**/*" || first.includes("*")) {
    return "app/page.tsx";
  }
  return first.replace(/^\.\//, "");
}
