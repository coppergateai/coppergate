/**
 * CodingAgent port — ARCHITECTURE §5.6.
 */

export type AgentRunMode = "implement" | "pr_review";

export type SkillSnapshotEntry = {
  key: string;
  title: string;
  version: number;
  /** True when the skill body was injected into the prompt. */
  included: boolean;
};

export type ToolInvokeRequest = {
  tool: string;
  args?: Record<string, unknown>;
};

export type ToolInvokeResult = {
  ok: boolean;
  summary: string;
  result?: Record<string, unknown>;
  error?: string;
  ms: number;
};

export type ToolInvoker = (
  req: ToolInvokeRequest,
) => Promise<ToolInvokeResult>;

export type AgentRunInput = {
  runId: string;
  taskId: string;
  workspaceId: string;
  projectId: string;
  goal: string;
  scope: string;
  allowedPaths: string[];
  acceptanceCriteria: string[];
  baseSha: string;
  toolAllowlist: string[];
  /**
   * Contender profile toolAllowlist. When non-empty, FILE writes require `edit`
   * (or `*`). Empty/undefined preserves legacy behavior (no profile gate).
   */
  profileTools?: string[];
  spendCapMicros: number;
  /** Architecture / brief context (non-secret). */
  architectureContext?: string;
  /** Contender strategy — blitz | fortress | balanced. */
  strategy?: string;
  /** Contender / profile prompt guidance (non-secret). */
  promptGuidance?: string;
  /** Absolute sandbox workdir when worker created a LocalSandboxManager clone. */
  sandboxWorkdir?: string;
  /** Sandbox id for evidence / audit (optional). */
  sandboxId?: string;
  /** Cooperative cancel check between events. */
  isCancelRequested?: () => boolean | Promise<boolean>;
  /**
   * Abort in-flight LLM HTTP when lease is lost, cancel is hard-stopped, or timeout fires.
   * Cooperative `isCancelRequested` alone cannot interrupt a hung fetch.
   */
  abortSignal?: AbortSignal;
  /** implement (default) opens/updates code; pr_review posts review markdown only. */
  mode?: AgentRunMode;
  /** Extra PR context for pr_review mode (title, files, etc.). */
  reviewContext?: string;
  /** Skills resolved at enqueue / execute (audit + prompt honesty). */
  skillSnapshot?: SkillSnapshotEntry[];
  /**
   * Optional MCP/Sonar tool invoker for a bounded tool-call loop (OpenAI path).
   * Cursor path uses worker preflight instead.
   */
  invokeTool?: ToolInvoker;
  /** Max tool rounds in harness loop. Default 4. */
  maxToolInvokes?: number;
};

export type AgentEventKind =
  | "progress"
  | "tool"
  | "file"
  | "cost"
  | "error"
  | "completion";

export type AgentEvent = {
  kind: AgentEventKind;
  message?: string;
  /** Sanitized structured payload — never secrets. */
  payload?: Record<string, unknown>;
};

export type FakeCompletionPayload = {
  branchName: string;
  headSha: string;
  prNumber: number;
  prUrl: string;
  filesChanged: string[];
  estimatedTokens: number;
  actualCostMicros: number;
  /** Present when mode is pr_review — markdown review body for GitHub COMMENT. */
  reviewBody?: string;
};

export interface CodingAgent {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}
