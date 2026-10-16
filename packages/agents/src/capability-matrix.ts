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
    id: "cursor_cloud",
    displayName: "Cursor Cloud",
    status: "wait",
    notes: "Blocked on public agent API availability.",
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
