import type { AgentEvent, AgentRunInput, CodingAgent } from "./types.js";
import { FakeCodingAgent } from "./fake.js";
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
 * OpenHands / Aider stub (TASK114) — documents wait-state until sandbox wire-up.
 * Falls back to FakeCodingAgent so tournaments remain runnable.
 */
export class OpenHandsHarnessStub implements ContenderHarness {
  readonly kind = "openhands" as const;
  readonly capability =
    "OpenHands BYO (stub) — executes FakeCodingAgent until sandbox adapter lands";
  private readonly fallback = new FakeCodingAgent();

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    yield {
      kind: "progress",
      message: "OpenHands harness stub — using FakeCodingAgent fallback",
      payload: { harness: this.kind, status: "stub" },
    };
    yield* this.fallback.run(input);
  }
}

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
      return new OpenHandsHarnessStub();
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
