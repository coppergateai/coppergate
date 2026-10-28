/**
 * TASK115 — BYO harness capability matrix (documented wait-states).
 */

export type HarnessCapability = {
  id: string;
  displayName: string;
  status: "live" | "stub" | "wait";
  notes: string;
};

export const HARNESS_CAPABILITY_MATRIX: HarnessCapability[] = [
  {
    id: "native_fake",
    displayName: "Native Fake",
    status: "live",
    notes: "Deterministic fixture agent for tests and dry-runs.",
  },
  {
    id: "native_openai",
    displayName: "OpenAI-compatible",
    status: "live",
    notes: "Requires apiKey; spend cap enforced in agent loop.",
  },
  {
    id: "openhands",
    displayName: "OpenHands",
    status: "live",
    notes:
      "Sandbox-backed MVP: writes scoped fix into worker LocalSandbox workdir; Fake fallback if no workdir.",
  },
  {
    id: "cursor_local",
    displayName: "Cursor local SDK",
    status: "live",
    notes:
      "Requires CURSOR_API_KEY / BYOK vendor=cursor and @cursor/sdk; mutates sandbox workdir.",
  },
  {
    id: "claude_code",
    displayName: "Claude Code (Agent SDK)",
    status: "live",
    notes:
      "Requires ANTHROPIC_API_KEY / BYOK vendor=claude_code and @anthropic-ai/claude-agent-sdk; mutates sandbox workdir.",
  },
  {
    id: "cursor_cloud",
    displayName: "Cursor Cloud",
    status: "wait",
    notes:
      "Cloud Background Agents still wait-state; use cursor_local / claude_code / BYOK for live runs.",
  },
  {
    id: "codex",
    displayName: "OpenAI Codex / cloud agent",
    status: "wait",
    notes: "Documented wait-state; no secret egress until adapter exists.",
  },
];

export function harnessCapability(id: string): HarnessCapability | null {
  return HARNESS_CAPABILITY_MATRIX.find((h) => h.id === id) ?? null;
}
