/**
 * Pure ledger for AG-016 provider failover spend (no DB imports — safe for unit tests).
 */

export type ProviderSpendRole = "primary" | "fallback";

export type ProviderSpendSlice = {
  costMicros: number;
  estimatedTokens: number;
  provider: string | null;
  model: string | null;
};

export type RunProviderSpendLedger = {
  primary: ProviderSpendSlice;
  fallback: ProviderSpendSlice | null;
  failover: boolean;
};

function emptySlice(): ProviderSpendSlice {
  return {
    costMicros: 0,
    estimatedTokens: 0,
    provider: null,
    model: null,
  };
}

export function createRunProviderSpendLedger(): RunProviderSpendLedger {
  return {
    primary: emptySlice(),
    fallback: null,
    failover: false,
  };
}

function sliceForPhase(
  ledger: RunProviderSpendLedger,
  phase: ProviderSpendRole,
): ProviderSpendSlice {
  if (phase === "fallback") {
    if (!ledger.fallback) ledger.fallback = emptySlice();
    return ledger.fallback;
  }
  return ledger.primary;
}

export function markProviderFailoverInLedger(
  ledger: RunProviderSpendLedger,
): void {
  ledger.failover = true;
  if (!ledger.fallback) ledger.fallback = emptySlice();
}

type CostPayload = {
  costMicros?: unknown;
  estimatedTokens?: unknown;
  provider?: unknown;
  harness?: unknown;
  model?: unknown;
  actualCostMicros?: unknown;
};

function readCostMicros(payload: CostPayload | null | undefined): number {
  if (!payload) return 0;
  const raw = payload.costMicros ?? payload.actualCostMicros;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function readTokens(payload: CostPayload | null | undefined): number {
  if (!payload) return 0;
  const n = Number(payload.estimatedTokens);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function readProvider(payload: CostPayload | null | undefined): string | null {
  if (!payload) return null;
  if (typeof payload.provider === "string" && payload.provider.trim()) {
    return payload.provider.trim();
  }
  if (typeof payload.harness === "string" && payload.harness.trim()) {
    return payload.harness.trim();
  }
  return null;
}

function readModel(payload: CostPayload | null | undefined): string | null {
  if (!payload) return null;
  return typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : null;
}

function applyToSlice(
  slice: ProviderSpendSlice,
  payload: CostPayload | null | undefined,
  mode: "add" | "completion",
): void {
  const cost = readCostMicros(payload);
  const tokens = readTokens(payload);
  const provider = readProvider(payload);
  const model = readModel(payload);
  if (mode === "add" && cost > 0) {
    slice.costMicros += cost;
  } else if (mode === "completion" && cost > 0) {
    slice.costMicros = Math.max(slice.costMicros, cost);
  }
  if (tokens > 0) {
    slice.estimatedTokens = Math.max(slice.estimatedTokens, tokens);
  }
  if (provider) slice.provider = provider;
  if (model) slice.model = model;
}

export function applyAgentCostEventToLedger(
  ledger: RunProviderSpendLedger,
  payload: Record<string, unknown> | null | undefined,
  phase: ProviderSpendRole,
): void {
  applyToSlice(sliceForPhase(ledger, phase), payload, "add");
}

export function applyAgentCompletionToLedger(
  ledger: RunProviderSpendLedger,
  payload: Record<string, unknown> | null | undefined,
  phase: ProviderSpendRole,
): void {
  applyToSlice(sliceForPhase(ledger, phase), payload, "completion");
}

export function totalRunSpendMicros(ledger: RunProviderSpendLedger): number {
  return (
    ledger.primary.costMicros + (ledger.fallback?.costMicros ?? 0)
  );
}

export type LlmUsageDebit = {
  providerRole: ProviderSpendRole;
  costMicros: number;
  quantity: string;
  provider: string | null;
  model: string | null;
};

export function buildLlmUsageDebits(
  ledger: RunProviderSpendLedger,
): LlmUsageDebit[] {
  const out: LlmUsageDebit[] = [];
  if (ledger.primary.costMicros > 0) {
    out.push({
      providerRole: "primary",
      costMicros: ledger.primary.costMicros,
      quantity: String(ledger.primary.estimatedTokens || 0),
      provider: ledger.primary.provider,
      model: ledger.primary.model,
    });
  }
  if (ledger.failover && ledger.fallback && ledger.fallback.costMicros > 0) {
    out.push({
      providerRole: "fallback",
      costMicros: ledger.fallback.costMicros,
      quantity: String(ledger.fallback.estimatedTokens || 0),
      provider: ledger.fallback.provider,
      model: ledger.fallback.model,
    });
  }
  return out;
}
