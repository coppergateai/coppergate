import type { AgentTemperament } from "./schema.js";

export const TEMPERAMENT_VALUES = ["steady", "swift", "balanced"] as const;

export function isAgentTemperament(v: string): v is AgentTemperament {
  return (TEMPERAMENT_VALUES as readonly string[]).includes(v);
}

export function defaultTemperamentForProfileKey(key: string): AgentTemperament {
  if (key === "reviewer" || key === "security" || key === "qa" || key === "release") {
    return "steady";
  }
  if (key === "triager" || key === "fixer") {
    return "swift";
  }
  return "balanced";
}

export function strategyForTemperament(
  temperament: AgentTemperament,
): "balanced" | "blitz" | "fortress" {
  if (temperament === "steady") return "fortress";
  if (temperament === "swift") return "blitz";
  return "balanced";
}

export function temperamentGuidance(temperament: AgentTemperament): string {
  if (temperament === "steady") {
    return [
      "Character: steady — calm, reliable progress.",
      "Prefer small verified steps, test-first, low blast radius.",
      "Do not rush; leave the tree green before expanding scope.",
    ].join(" ");
  }
  if (temperament === "swift") {
    return [
      "Character: swift — fast action, minimal scope.",
      "Land a thin working change quickly, then harden if needed.",
      "Avoid long analysis loops; ship the smallest acceptance slice.",
    ].join(" ");
  }
  return "Character: balanced — weigh speed against verification.";
}

/** Append temperament blurb to profile guidance for the agent prompt. */
export function withTemperamentGuidance(
  promptGuidance: string,
  temperament: string | null | undefined,
): string {
  const raw = temperament ?? "balanced";
  const t: AgentTemperament = isAgentTemperament(raw) ? raw : "balanced";
  const blurb = temperamentGuidance(t);
  const base = promptGuidance.trim();
  if (!base) return blurb;
  if (base.includes("Character:")) return base;
  return `${base}\n\n${blurb}`;
}
