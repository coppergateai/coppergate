# OPP — Coppergate as first runtime consumer

**OPP** (Open Program Protocol) is the second external factory product ([D16](../../coppergate-architecture/docs/DECISIONS.md)): portable Open Program contract + Ship Receipt verify.

Coppergate remains the **selection runtime**. Bind OPP (or any) Open Program via project Configuration → **Open Program bind** (P-105):

| Field | Example |
| --- | --- |
| `architectureRepo` | `coppergateai/opp` |
| `architecturePaths` | `docs/OPEN_PROGRAM.md` |

Validate Open IDs in-product, then Arena Spend License refuses invent-without-program. Accept emits a Ship Receipt; public-safe share is P-106.

## Accept → verify (RT-010 / RT-020 / RT-030)

Set `OPP_API_URL` (default unset = skip; Community `https://api.opp.coppergate.ai`). After Accept, Coppergate persists a Ship Receipt, projects it (`projectShipReceiptToOpp`), and when `OPP_API_URL` is set calls `@coppergate/opp-client` → `verifyReceipt`. Result is audited as `task.ship_receipt.opp_verify` and **never** rolls back Accept.

| Env | Purpose |
| --- | --- |
| `OPP_API_URL` | Hosted or local OPP base URL — see [`.env.example`](../.env.example) |
| unset | Skip verify (`opp_api_url_unset` audit) |

**Production (RT-040):** set on both hosts so Accept (web) and auto-accept (worker) verify:

| Host | Where |
| --- | --- |
| Vercel `coppergate` | Production + Preview env `OPP_API_URL=https://api.opp.coppergate.ai` |
| Fly `coppergate-worker` | Secret + `fly.toml` `[env]` |

```bash
# Prove Community API from this monorepo (RT-030)
pnpm smoke:opp-hosted
# or
OPP_API_URL=https://api.opp.coppergate.ai pnpm smoke:opp-hosted
```

After a production Accept, audit `task.ship_receipt.opp_verify` should show `{ ok: true, openId }` (or a structured deny reason) — not `opp_api_url_unset`.

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
