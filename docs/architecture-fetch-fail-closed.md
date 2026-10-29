# Architecture fetch fail-closed (AG-020)

When maintainer replan loads the bound Open Program markdown and GitHub returns **bad token** / **404** / misconfigured repo, Coppergate must **not invent** freestyle tasks and must surface a Mission Control tip to **re-bind** the Open Program path.

## Before

`fetchArchitectureBacklogMarkdown` swallowed per-path errors and returned `""`. Replan then skipped with `no_architecture_open_id` — indistinguishable from an honestly empty program.

## After

| Outcome | Replan skip reason | Mission Control |
| --- | --- | --- |
| Token 401/403 or all paths missing | `architecture_fetch_failed` | Calm tip → project Settings (re-bind `architectureRepo` / `architecturePaths`) |
| Markdown loads, no Open rows | `no_architecture_open_id` | Existing AG-015 idle copy |
| Open IDs already on the board | `architecture_ids_in_flight` | Existing AG-015 in-flight copy |

## API

- `fetchArchitectureBacklogMarkdownResult` — `{ ok, markdown, failure? }`
- `fetchArchitectureBacklogMarkdown` — still returns string (empty on failure) for legacy callers

## Evidence

- `packages/db/src/architecture-program-fetch.test.ts`
- `packages/db/src/mission-control-replan.test.ts`
