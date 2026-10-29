# Architecture fetch fail-closed (AG-020)

Program-bound projects load spendable Open IDs from GitHub (`architectureRepo` + `architecturePaths`). When that fetch fails, Coppergate **does not invent** backlog tasks from vision or env fallbacks.

## Failure modes

| Signal | Maintainer | Backlog UI |
|--------|------------|------------|
| Bad / missing GitHub token (401, scoped 403) | Replan skip `architecture_fetch_failed` | Fetch error row — no synthetic Open IDs |
| Program path 404 (wrong `architecturePaths`) | Same | Same |
| Empty markdown at bound path | Same | Re-bind Program path copy |

## Mission Control

Recent `maintainer.replan` audits with `architecture_fetch_failed` surface **`architecture_fetch_failed`** attention (normal priority, not `replan_failed`). CTA links to **Configuration → Open Program bind** (`#open-program-bind`) so operators re-bind the Program path and fix App/token access.

Validate bind in Configuration via **Validate Open Program** — uses the same fail-closed fetch as maintainer.

## Related

- Open Program bind UI: project **Configuration** tab
- Idle vs fetch: `no_architecture_open_id` means fetch succeeded but no open row; fetch failures are configuration errors (AG-020)
