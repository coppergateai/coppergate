# Coppergate private beta (TASK032)

Pilot guide for 5–10 users.

## Promise

**Wedge (D14):** Import a GitHub issue → approve a task → get a reviewable PR with evidence and cost → accept or request changes — without operator intervention on the supported path.

See [WEDGE.md](./WEDGE.md) and [GTM.md](./GTM.md) for paid-pilot process.

## Supported stack (MVP)

- **Template / fixture:** `nextjs_ts` (`coppergate-examples/nextjs_ts`) for `new_product` projects
- **Existing repos:** stack is detected on bind from root files + SCM Languages API (`nextjs_ts`, `node`, `go`, `rust`, `python`, …, or `unknown`). Workspace owners can **Re-detect stacks** to backfill.
- **Auth:** GitHub OAuth (user) + GitHub App (repo); GitLab OAuth + project connect also supported
- **Agent (pilot default):** With `GITHUB_DELIVERY_MODE=http`, worker prefers workspace BYOK / env OpenAI, else `CONTENDER_HARNESS=openhands` (sandbox-backed). FakeCodingAgent only when delivery is `fake` or CI/test. Coding agent path is primarily `nextjs_ts`; other stacks are best-effort (UI soft warning).
- **Sandbox:** Worker creates a `LocalSandboxManager` workdir per run (`SANDBOX_MODE=local` default).
- **Delivery:** Branch + PR/MR only (never default branch); live GitHub App + GitLab. Bitbucket/ADO deferred. FakeGithubDelivery in local/dev without App credentials
- **CI gate:** Live `check_run` / Actions webhooks attach via `ingestCiEvidence`. Accept stays closed while fitness is pending or CI failed.

## Explicit non-goals (this pilot)

- Full org multi-repo merge (dogfood uses capped secondaries — see [KPROMPT_DOGFOOD.md](./KPROMPT_DOGFOOD.md); max 5 secondaries, primary writes only)
- Autonomous merge or production deploy
- Design-agent UI generation and marketing asset pipelines
- Enterprise SSO, SCIM, or custom VPC sandbox fleets
- Training on private customer code
- Bitbucket / Azure DevOps adapters (deferred)

## Limitations

- One coding run per repo concurrency (MVP)
- Autonomy L0–L2; merge remains human
- Soft-deleted workspaces: credentials purged immediately; data retained ~30 days
- Real GitHub write path requires App install + secrets; Fake delivery path does not open public PRs

## Policies

- [Terms](/terms) · [Privacy](/privacy) · [Security](/security)
- Acceptable use: no attempts to extract secrets, probe sandbox egress, or use the platform to attack third parties.

## How to join

1. Sign up via landing early-access / GitHub login (paid pilots redeem an invite).
2. Connect one throwaway or low-risk repo; set a hard spend cap; approve a brief.
3. In the project **Issues** panel: **Import → queue** a small open issue (no seed SQL).
4. When the PR is reviewable: confirm cost + diff + CI evidence → **Accept → Done** in-product.
5. Share feedback on time-to-first-PR, cost, and rework; schedule a second issue within 7 days.

Checklist: [WEDGE.md](./WEDGE.md) (staging proven 2026-10-17 — [PR #5](https://github.com/coppergateai/coppergate-staging-smoke/pull/5)). Recovery: [/docs/recovery](/docs/recovery). Billing smoke: [`scripts/manual-billing-smoke.md`](../scripts/manual-billing-smoke.md). Sonar/CI-fail seed scripts are a **secondary** vertical — not the join path.

Paid / waitlist ops: [PILOT_OUTREACH.md](./PILOT_OUTREACH.md). Self-serve failure recovery: [/docs/recovery](/docs/recovery).

## Ops

See [OPS_RUNBOOK.md](./OPS_RUNBOOK.md) for worker crash recovery and purge behavior.
