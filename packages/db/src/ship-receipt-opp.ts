/**
 * RT-020 — Project Coppergate Ship Receipt → portable OPP body and verify
 * over HTTP when OPP_API_URL is set. Never throws into Accept.
 */

import { OppClient } from "@coppergate/opp-client";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import type { ShipReceiptBody } from "./ship-receipt.js";

/** Portable OPP verify body (no Coppergate runtime-local fields). */
export type OppShipReceiptVerifyBody = {
  kind: "ship_receipt";
  protocolVersion: string;
  openId: string | null;
  title: string;
  spendMicros: number;
  fitnessScore: number | null;
  ci: ShipReceiptBody["ci"];
  writeback: ShipReceiptBody["writeback"];
  acceptedAt: string;
};

export const OPP_PROTOCOL_VERSION = "0.1.0";

/** Drop runtime-local fields for OPP verify (RT-020 / RT-010 runbook). */
export function projectShipReceiptToOpp(
  receipt: ShipReceiptBody,
): OppShipReceiptVerifyBody {
  return {
    kind: "ship_receipt",
    protocolVersion: OPP_PROTOCOL_VERSION,
    openId: receipt.openId,
    title: receipt.title,
    spendMicros: receipt.spendMicros,
    fitnessScore: receipt.fitnessScore,
    ci: {
      acceptReady: receipt.ci.acceptReady,
      blocking: receipt.ci.blocking,
      passed: receipt.ci.passed,
      checkCount: receipt.ci.checkCount,
    },
    writeback: {
      architectureId: receipt.writeback.architectureId,
      note: receipt.writeback.note,
    },
    acceptedAt: receipt.acceptedAt,
  };
}

export type OppVerifyAuditMeta = {
  skipped?: boolean;
  reason?: string;
  ok?: boolean;
  openId?: string | null;
  error?: string;
};

/**
 * Best-effort OPP verify after Accept. No-op without OPP_API_URL.
 * Failures are returned as meta — caller audits; Accept is never rolled back.
 */
export async function verifyShipReceiptWithOpp(input: {
  receipt: ShipReceiptBody;
  markdown: string;
  oppApiUrl?: string | null;
  fetch?: typeof fetch;
}): Promise<OppVerifyAuditMeta> {
  const baseUrl =
    input.oppApiUrl?.trim() || process.env.OPP_API_URL?.trim() || "";
  if (!baseUrl) {
    return { skipped: true, reason: "opp_api_url_unset" };
  }
  if (!input.markdown.trim()) {
    return { skipped: true, reason: "program_markdown_empty" };
  }

  try {
    const client = new OppClient({
      baseUrl,
      fetch: input.fetch,
    });
    const portable = projectShipReceiptToOpp(input.receipt);
    const result = await client.verifyReceipt({
      markdown: input.markdown,
      receipt: portable,
    });
    return {
      ok: result.ok,
      openId: result.openId ?? input.receipt.openId,
      reason: result.reason,
    };
  } catch (err) {
    return {
      ok: false,
      openId: input.receipt.openId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * After persistShipReceipt: verify via OPP when configured; always audit.
 * Caller supplies bound Open Program markdown. Swallows all errors.
 */
export async function auditOppVerifyAfterAccept(
  db: Database,
  input: {
    workspaceId: string;
    taskId: string;
    actor: string;
    receipt: ShipReceiptBody;
    markdown: string;
  },
): Promise<void> {
  try {
    const meta = await verifyShipReceiptWithOpp({
      receipt: input.receipt,
      markdown: input.markdown,
    });
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "task.ship_receipt.opp_verify",
      targetType: "task",
      targetId: input.taskId,
      meta,
    });
  } catch {
    /* Accept must not fail on OPP verify / audit */
  }
}
