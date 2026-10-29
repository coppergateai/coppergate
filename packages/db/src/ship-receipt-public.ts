/**
 * Public-safe Ship Receipt projection (P-106) — no DB / side-effect imports.
 */

export type PublicShipReceiptCi = {
  acceptReady: boolean;
  blocking: boolean;
  passed: boolean;
  checkCount: number;
};

export type PublicShipReceiptSource = {
  openId: string | null;
  spendMicros: number;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  ci: PublicShipReceiptCi;
  writeback: {
    architectureId: string | null;
    note: string;
  };
  acceptedAt: string;
  title: string;
};

export type PublicShipReceipt = {
  kind: "shared_ship_receipt";
  openId: string | null;
  spendMicros: number;
  spendLabel: string;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  ci: PublicShipReceiptCi;
  writeback: {
    architectureId: string | null;
    note: string;
  };
  acceptedAt: string;
  title: string;
};

function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

/** Redact member-only fields for public share (no acceptedBy, no tokens). */
export function toPublicShipReceipt(
  receipt: PublicShipReceiptSource,
): PublicShipReceipt {
  return {
    kind: "shared_ship_receipt",
    openId: receipt.openId,
    spendMicros: receipt.spendMicros,
    spendLabel: formatUsd(receipt.spendMicros),
    fitnessScore: receipt.fitnessScore,
    efficiencyScore: receipt.efficiencyScore,
    ci: receipt.ci,
    writeback: {
      architectureId: receipt.writeback.architectureId,
      note: receipt.writeback.note,
    },
    acceptedAt: receipt.acceptedAt,
    title: receipt.title,
  };
}
