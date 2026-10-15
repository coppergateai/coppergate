# Coppergate private beta (TASK032)

Pilot guide for 5–10 users.

## Promise

Describe a scoped change → approve a task → get a reviewable PR with evidence and cost → accept or request changes — without operator intervention on the supported path.

## Supported stack (MVP)

- **Template / fixture:** `nextjs_ts` (`coppergate-examples/nextjs_ts`) for `new_product` projects
- **Existing repos:** stack is detected on bind from root files + SCM Languages API (`nextjs_ts`, `node`, `go`, `rust`, `python`, …, or `unknown`). Workspace owners can **Re-detect stacks** to backfill.
- **Auth:** GitHub OAuth (user) + GitHub App (repo); GitLab OAuth + project connect also supported
- **Agent:** FakeCodingAgent by default; optional OpenAI-compatible provider via env. Coding agent path is primarily `nextjs_ts`; other stacks are best-effort (UI soft warning).
- **Delivery:** Branch + PR only (never default branch); FakeGithubDelivery in local/dev without App credentials

## Explicit non-goals (this pilot)

- Multi-repo / monorepo orchestration across many packages
- Autonomous merge or production deploy
- Design-agent UI generation and marketing asset pipelines
- Enterprise SSO, SCIM, or custom VPC sandbox fleets
- Training on private customer code

## Limitations

- One coding run per repo concurrency (MVP)
- Autonomy L0–L2; merge remains human
- Soft-deleted workspaces: credentials purged immediately; data retained ~30 days
- Real GitHub write path requires App install + secrets; CI FakeAgent path does not open public PRs

## Policies

- [Terms](/terms) · [Privacy](/privacy) · [Security](/security)
- Acceptable use: no attempts to extract secrets, probe sandbox egress, or use the platform to attack third parties.

## How to join

1. Sign up via landing early-access / GitHub login.
2. Connect one throwaway or low-risk repo.
3. Run a small template task; accept the PR in-product.
4. Share feedback on time-to-first-PR, cost, and rework.

## Ops

See [OPS_RUNBOOK.md](./OPS_RUNBOOK.md) for worker crash recovery and purge behavior.
