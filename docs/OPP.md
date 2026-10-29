# OPP — Coppergate as first runtime consumer

**OPP** (Open Program Protocol) is the second external factory product ([D16](../../coppergate-architecture/docs/DECISIONS.md)): portable Open Program contract + Ship Receipt verify.

Coppergate remains the **selection runtime**. Bind OPP (or any) Open Program via project Configuration → **Open Program bind** (P-105):

| Field | Example |
| --- | --- |
| `architectureRepo` | `coppergateai/opp` |
| `architecturePaths` | `docs/OPEN_PROGRAM.md` |

Validate Open IDs in-product, then Arena Spend License refuses invent-without-program. Accept emits a Ship Receipt; public-safe share is P-106.

## Accept → verify (RT-010 / RT-020)

Set `OPP_API_URL` (default unset = skip; Community `https://api.opp.coppergate.ai`). After Accept, Coppergate persists a Ship Receipt, projects it (`projectShipReceiptToOpp`), and when `OPP_API_URL` is set calls `@coppergate/opp-client` → `verifyReceipt`. Result is audited as `task.ship_receipt.opp_verify` and **never** rolls back Accept.

Full operator runbook: [`../../opp/docs/protocol/accept-verify-runbook.md`](../../opp/docs/protocol/accept-verify-runbook.md) · projection: [`../../opp/docs/protocol/coppergate-runtime.md`](../../opp/docs/protocol/coppergate-runtime.md).

## Packages

Local OPP packages (workspace sibling):

- `@opp/parse` — markdown program rows (same ID grammar as Coppergate)
- `@opp/verify` — Spend License + receipt verify
- `@opp/client` — first-party HTTP SDK
- `@opp/api` — `POST /v1/programs/parse`, `/v1/spend/evaluate`, `/v1/receipts/verify`
- `@coppergate/opp-client` — thin factory adapter (`OPP_API_URL`)

Dogfood: [`../../opp/docs/OPP_DOGFOOD.md`](../../opp/docs/OPP_DOGFOOD.md)

Community $0 only — do not add paid OPP SKUs.
