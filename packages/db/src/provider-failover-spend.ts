/**
 * AG-016 — Persist provider failover spend debits (primary + fallback).
 */

import type { Database } from "./client.js";
import { appendUsageEvent } from "./budgets.js";
import { recordAuditEvent } from "./briefs.js";
import {
  buildLlmUsageDebits,
  totalRunSpendMicros,
  type RunProviderSpendLedger,
} from "./provider-failover-spend-ledger.js";
import { appendRunEvent } from "./run-events.js";

export {
  applyAgentCompletionToLedger,
  applyAgentCostEventToLedger,
  buildLlmUsageDebits,
  createRunProviderSpendLedger,
  markProviderFailoverInLedger,
  totalRunSpendMicros,
  type LlmUsageDebit,
  type ProviderSpendRole,
  type ProviderSpendSlice,
  type RunProviderSpendLedger,
} from "./provider-failover-spend-ledger.js";

export async function persistRunLlmSpendFromLedger(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    runId: string;
    ledger: RunProviderSpendLedger;
    actor: string;
  },
): Promise<number> {
  const debits = buildLlmUsageDebits(input.ledger);
  for (const debit of debits) {
    await appendUsageEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      runId: input.runId,
      kind: "llm_tokens",
      costMicros: debit.costMicros,
      quantity: debit.quantity,
      provider: debit.provider ?? undefined,
      model: debit.model ?? undefined,
      meta: { providerRole: debit.providerRole, failover: input.ledger.failover },
    });

    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "run.llm_debit",
      targetType: "run",
      targetId: input.runId,
      meta: {
        projectId: input.projectId,
        taskId: input.taskId,
        runId: input.runId,
        providerRole: debit.providerRole,
        provider: debit.provider,
        model: debit.model,
        costMicros: debit.costMicros,
        failover: input.ledger.failover,
      },
    });

    await appendRunEvent(db, {
      runId: input.runId,
      workspaceId: input.workspaceId,
      kind: "progress",
      payload: {
        code: "provider_spend_debited",
        providerRole: debit.providerRole,
        provider: debit.provider,
        model: debit.model,
        costMicros: debit.costMicros,
        failover: input.ledger.failover,
      },
    });
  }
  return totalRunSpendMicros(input.ledger);
}
