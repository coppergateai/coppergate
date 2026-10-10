/**
 * CodingAgent port — ARCHITECTURE §5.6.
 */

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
  spendCapMicros: number;
  /** Architecture / brief context (non-secret). */
  architectureContext?: string;
  /** Cooperative cancel check between events. */
  isCancelRequested?: () => boolean | Promise<boolean>;
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
};

export interface CodingAgent {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}
