import type { AgentEvent, AgentRunInput, CodingAgent } from "./types.js";
import { createCodingAgent } from "./create-agent.js";
import {
  ClaudeCodeCodingAgent,
  type ClaudeCodeBridge,
} from "./claude-code.js";
import {
  CursorSdkCodingAgent,
  type CursorSdkBridge,
} from "./cursor-sdk.js";
import { FakeCodingAgent } from "./fake.js";
import type { OpenAiCompatibleConfig } from "./openai-compatible.js";

/**
 * ContenderHarness port (TASK113) — external coding runtimes as arena backends.
 * CodingAgent remains the native path; harnesses adapt to the same event stream.
 */
export type ContenderHarnessKind =
  | "native_fake"
  | "native_openai"
  | "openhands"
  | "aider"
  | "cursor_local"
  | "claude_code"
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
 * Always fail-closed; legacy FakeCodingAgent / scaffold stub path removed.
 */
export class OpenHandsSandboxHarness implements ContenderHarness {
  readonly kind = "openhands" as const;
  readonly capability =
    "OpenHands BYO — requires real runtime; stub path removed";

  async *run(_input: AgentRunInput): AsyncIterable<AgentEvent> {
    yield {
      kind: "error",
      message:
        "OpenHands/Aider harness is not wired. Configure workspace BYOK (native OpenAI-compatible or Cursor local) instead.",
      payload: {
        code: "harness_stub_disabled",
        harness: this.kind,
        hint: "native_openai_byok",
      },
    };
  }
}

/** @deprecated Use OpenHandsSandboxHarness — kept as alias for imports. */
export const OpenHandsHarnessStub = OpenHandsSandboxHarness;

/** Live Cursor local SDK harness (BYOK / CURSOR_API_KEY). */
export class CursorLocalHarness implements ContenderHarness {
  readonly kind = "cursor_local" as const;
  readonly capability =
    "Cursor local SDK (@cursor/sdk) — mutates sandbox workdir; BYOK vendor=cursor";
  constructor(private readonly agent: CodingAgent) {}
  run(input: AgentRunInput) {
    return this.agent.run(input);
  }
}

/** Live Claude Agent SDK harness (BYOK / ANTHROPIC_API_KEY). */
export class ClaudeCodeHarness implements ContenderHarness {
  readonly kind = "claude_code" as const;
  readonly capability =
    "Claude Agent SDK (@anthropic-ai/claude-agent-sdk) — mutates sandbox workdir; BYOK vendor=claude_code";
  constructor(private readonly agent: CodingAgent) {}
  run(input: AgentRunInput) {
    return this.agent.run(input);
  }
}

/** Cursor Cloud / Codex — API wait-state; no FakeCodingAgent fallback. */
export class CursorCloudHarnessStub implements ContenderHarness {
  readonly kind = "cursor_cloud" as const;
  readonly capability =
    "Cursor Cloud Background Agents — awaiting public API; no stub fallback";

  async *run(_input: AgentRunInput): AsyncIterable<AgentEvent> {
    yield {
      kind: "error",
      message:
        "Cursor Cloud harness not available. Use BYOK vendor=cursor (cursor_local), claude_code, or OpenAI-compatible agent.",
      payload: { code: "harness_stub_disabled", harness: this.kind },
    };
  }
}

export type CreateHarnessOptions = {
  kind?: ContenderHarnessKind;
  openai?: OpenAiCompatibleConfig;
  cursor?: {
    apiKey: string;
    model?: string;
    bridge?: CursorSdkBridge;
  };
  claudeCode?: {
    apiKey: string;
    model?: string;
    bridge?: ClaudeCodeBridge;
  };
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
        createCodingAgent({
          apiKey: opts.openai.apiKey,
          baseUrl: opts.openai.baseUrl,
          model: opts.openai.model,
          fetchImpl: opts.openai.fetchImpl,
        }),
      );
    case "cursor_local": {
      const allowEnv =
        process.env.ALLOW_ENV_LLM_KEYS === "1" ||
        process.env.NODE_ENV !== "production";
      const apiKey =
        opts.cursor?.apiKey?.trim() ||
        (allowEnv ? process.env.CURSOR_API_KEY?.trim() : "") ||
        "";
      if (!apiKey) {
        throw new Error(
          "cursor_local harness requires cursor.apiKey (or CURSOR_API_KEY when ALLOW_ENV_LLM_KEYS=1 / non-production)",
        );
      }
      return new CursorLocalHarness(
        new CursorSdkCodingAgent({
          apiKey,
          model: opts.cursor?.model,
          bridge: opts.cursor?.bridge,
        }),
      );
    }
    case "claude_code": {
      const allowEnv =
        process.env.ALLOW_ENV_LLM_KEYS === "1" ||
        process.env.NODE_ENV !== "production";
      const apiKey =
        opts.claudeCode?.apiKey?.trim() ||
        (allowEnv
          ? process.env.ANTHROPIC_API_KEY?.trim() ||
            process.env.CLAUDE_CODE_API_KEY?.trim()
          : "") ||
        "";
      if (!apiKey) {
        throw new Error(
          "claude_code harness requires claudeCode.apiKey (or ANTHROPIC_API_KEY when ALLOW_ENV_LLM_KEYS=1 / non-production)",
        );
      }
      return new ClaudeCodeHarness(
        new ClaudeCodeCodingAgent({
          apiKey,
          model: opts.claudeCode?.model,
          bridge: opts.claudeCode?.bridge,
        }),
      );
    }
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
