# OPP — Coppergate as first runtime consumer

**OPP** (Open Program Protocol) is the second external factory product ([D16](../../coppergate-architecture/docs/DECISIONS.md)): portable Open Program contract + Ship Receipt verify.

Coppergate remains the **selection runtime**. Bind OPP (or any) Open Program via project Configuration → **Open Program bind** (P-105):

| Field | Example |
| --- | --- |
| `architectureRepo` | `coppergateai/opp` |
| `architecturePaths` | `docs/OPEN_PROGRAM.md` |

Validate Open IDs in-product, then Arena Spend License refuses invent-without-program. Accept emits a Ship Receipt; public-safe share is P-106.

Local OPP packages (workspace sibling):

- `@opp/parse` — markdown program rows (same ID grammar as Coppergate)
- `@opp/verify` — Spend License + receipt verify
- `@opp/api` — `POST /v1/programs/parse`, `/v1/spend/evaluate`, `/v1/receipts/verify`

Dogfood: [`../../opp/docs/OPP_DOGFOOD.md`](../../opp/docs/OPP_DOGFOOD.md)

Community $0 only — do not add paid OPP SKUs.
