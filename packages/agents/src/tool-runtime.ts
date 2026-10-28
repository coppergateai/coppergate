import type {
  AgentEvent,
  ToolInvoker,
  ToolInvokeRequest,
  ToolInvokeResult,
} from "./types.js";

export type { ToolInvoker, ToolInvokeRequest, ToolInvokeResult };

export type ToolRuntimeOptions = {
  /** Effective profile / run allowlist tokens. */
  allowlist: readonly string[];
  /** Tools that can actually be invoked (intersection with connection). */
  invokableTools: readonly string[];
  /** Alias workspace defs: aliasKey → targetToken. */
  aliases?: ReadonlyMap<string, string>;
  /** Custom defs are policy-only — never invokable. */
  customTools?: ReadonlySet<string>;
  invoke: ToolInvoker;
  /** Max tool calls per run (bounded loop). Default 4. */
  maxInvokes?: number;
};

export class ToolRuntimeError extends Error {
  readonly code:
    | "not_allowed"
    | "policy_only"
    | "unknown"
    | "budget_exhausted";
  constructor(
    code: ToolRuntimeError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ToolRuntimeError";
    this.code = code;
  }
}

const CORE_TOKENS = new Set(["read", "edit", "test", "git"]);

/**
 * Fail-closed tool runtime: resolve aliases, refuse custom/policy-only,
 * gate on allowlist ∩ invokable set, emit scrubbed tool events.
 */
export class ToolRuntime {
  private invokes = 0;
  private readonly maxInvokes: number;
  private readonly allowlist: Set<string>;
  private readonly invokable: Set<string>;
  private readonly aliases: ReadonlyMap<string, string>;
  private readonly custom: ReadonlySet<string>;
  private readonly invokeImpl: ToolInvoker;

  constructor(options: ToolRuntimeOptions) {
    this.allowlist = new Set(options.allowlist);
    this.invokable = new Set(options.invokableTools);
    this.aliases = options.aliases ?? new Map();
    this.custom = options.customTools ?? new Set();
    this.invokeImpl = options.invoke;
    this.maxInvokes = Math.max(1, options.maxInvokes ?? 4);
  }

  resolveToken(tool: string): string {
    const alias = this.aliases.get(tool);
    return alias ?? tool;
  }

  isCore(tool: string): boolean {
    return CORE_TOKENS.has(this.resolveToken(tool));
  }

  private isGranted(token: string, raw: string): boolean {
    if (this.allowlist.has(token) || this.allowlist.has(raw)) return true;
    if (this.allowlist.has("mcp:*")) return true;
    if (token.startsWith("sonar_") && this.allowlist.has("mcp:sonarqube")) {
      return true;
    }
    // Generic HTTPS MCP provider tag covers connection-listed tool names.
    if (this.allowlist.has("mcp:mcp") && this.invokable.has(token)) {
      return true;
    }
    return false;
  }

  canInvoke(
    tool: string,
  ):
    | { ok: true; token: string }
    | { ok: false; reason: ToolRuntimeError["code"] } {
    const token = this.resolveToken(tool);
    if (this.custom.has(tool) || this.custom.has(token)) {
      return { ok: false, reason: "policy_only" };
    }
    if (CORE_TOKENS.has(token)) {
      return { ok: false, reason: "policy_only" };
    }
    if (!this.isGranted(token, tool)) {
      return { ok: false, reason: "not_allowed" };
    }
    if (!this.invokable.has(token) && !this.invokable.has(tool)) {
      return { ok: false, reason: "unknown" };
    }
    return { ok: true, token };
  }

  async call(req: ToolInvokeRequest): Promise<ToolInvokeResult> {
    if (this.invokes >= this.maxInvokes) {
      throw new ToolRuntimeError(
        "budget_exhausted",
        `tool invoke budget exhausted (max ${this.maxInvokes})`,
      );
    }
    const gate = this.canInvoke(req.tool);
    if (!gate.ok) {
      throw new ToolRuntimeError(
        gate.reason,
        gate.reason === "policy_only"
          ? `tool ${req.tool} is catalog/policy only`
          : gate.reason === "not_allowed"
            ? `tool ${req.tool} not on profile allowlist`
            : `tool ${req.tool} has no invoker`,
      );
    }
    this.invokes += 1;
    const started = Date.now();
    try {
      const result = await this.invokeImpl({
        tool: gate.token,
        args: req.args,
      });
      return {
        ...result,
        ms: result.ms || Date.now() - started,
      };
    } catch (err) {
      return {
        ok: false,
        summary: err instanceof Error ? err.message.slice(0, 400) : String(err),
        error: err instanceof Error ? err.message.slice(0, 400) : String(err),
        ms: Date.now() - started,
      };
    }
  }

  toAgentEvent(
    tool: string,
    result: ToolInvokeResult,
    extra?: Record<string, unknown>,
  ): AgentEvent {
    return {
      kind: "tool",
      message: result.ok
        ? `tool ${tool} ok (${result.ms}ms)`
        : `tool ${tool} failed`,
      payload: {
        tool,
        ok: result.ok,
        ms: result.ms,
        summary: result.summary,
        ...(result.error ? { error: result.error } : {}),
        ...(extra ?? {}),
      },
    };
  }
}

/**
 * Run a bounded preflight over invokable tools (Cursor path / worker inject).
 * Yields tool events; returns markdown blocks to append to architecture context.
 */
export async function runToolPreflight(input: {
  runtime: ToolRuntime;
  tools: readonly string[];
  argsForTool?: (tool: string) => Record<string, unknown> | undefined;
  phase?: string;
}): Promise<{ events: AgentEvent[]; contextBlocks: string[] }> {
  const events: AgentEvent[] = [];
  const contextBlocks: string[] = [];
  const phase = input.phase ?? "tool_preflight";
  for (const tool of input.tools) {
    const gate = input.runtime.canInvoke(tool);
    if (!gate.ok) {
      events.push({
        kind: "tool",
        message: `skip ${tool}: ${gate.reason}`,
        payload: { tool, ok: false, phase, skipped: gate.reason },
      });
      continue;
    }
    const result = await input.runtime.call({
      tool,
      args: input.argsForTool?.(tool),
    });
    events.push(input.runtime.toAgentEvent(tool, result, { phase }));
    if (result.ok && result.summary) {
      contextBlocks.push(`### Tool preflight: ${tool}\n${result.summary}`);
    }
  }
  return { events, contextBlocks };
}
