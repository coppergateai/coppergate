# Coppergate GTM — path to $1M ARR

Operator playbook for the commercial wedge. Product north star remains the Survivor arena; revenue path is **hosted** Starter/Pro (MIT self-host = awareness, not the cash register).

**Phase 0 master checklist:** [PHASE0_OPS.md](./PHASE0_OPS.md).

## Locked wedge (D14)

**Primary:** existing-repo **GitHub issue → verified PR** (CI + cost + review).

**Signature demo (marketing only):** idea → brief → tournament → survivor PR.

**Secondary depth (do not sell in parallel):** Sentry alert → fix arena → PR; CI-fail → fix arena → PR.

Do **not** prioritize Bitbucket/ADO live delivery, SSO/SCIM, or broad adapter breadth until paying customers pull them. See [EXPAND_PULL.md](./EXPAND_PULL.md).

## Funnel stages

Instrumentation (`@coppergate/telemetry` funnel):

`landing_visit` → `github_connected` → `brief_approved` | `issue_imported` → `task_started` → `pr_opened` → `pr_accepted` → `second_pr_accepted` → `paid_pilot_started` / `checkout_completed`

North-star metric: **verified delivery rate** (accepted PRs with checks per active workspace / month).

## Phase 0 — 30 days (paid proof)

Target: 5–10 technical solo founders; **≥3 paid pilots** (deposit or monthly).

1. Run outreach from [PILOT_OUTREACH.md](./PILOT_OUTREACH.md) / `pnpm ops:outreach-pack`.
2. Export waitlist: `pnpm ops:waitlist` (or `-- --csv`).
3. Issue paid invites: `pnpm ops:pilot-invite -- PAID-XXXX 1 paid_pilot` or batch via outreach-pack.
4. Concierge OK — but every delivery must show PR + evidence + cost in-product ([CONCIERGE_RUNBOOK.md](./CONCIERGE_RUNBOOK.md)).
5. Go/no-go: `pnpm ops:pilot-go-no-go`.

**Go** if: ≥1 pilot with second accepted PR **and** (≥3 paid_pilot redeemed **or** ≥3 active/trialing Stripe subs).  
**No-go:** narrow messaging to issue→PR only; soft-pedal Survivor theater until retention moves.

## Phase 1 — 60–90 days (monetize)

| Priority | Work |
|---|---|
| P0 | Stripe Starter/Pro checkout + customer portal ([pricing](/docs/pricing), [STRIPE_PRODUCTION.md](./STRIPE_PRODUCTION.md)) |
| P0 | Onboarding: connect → budget → import issue → PR in one session |
| P0 | Self-serve recovery ([/docs/recovery](/docs/recovery)) |
| P1 | Deepen Issue + Sentry/CI-fail only |
| P1 | Hero demo + shareable redacted reports + launch content ([LAUNCH_KIT.md](./LAUNCH_KIT.md), [launch/](./launch/)) |

## Phase 2 — 6–12 months

Retention habit → content distribution (IH/HN) → expand **only on pull** → Phase X harden for Team plan.

## Pricing (locked for pilots)

| Plan | Price | Includes |
|---|---|---|
| Community | $0 | MIT self-host, BYOK, user-managed sandboxes |
| Starter | **$99/mo** + usage | Hosted sandboxes, modest concurrency |
| Pro | **$199/mo** + usage | Higher concurrency, previews, multi-project |
| Team | later | SSO, audit retention, shared budgets |

Exact Stripe Price IDs live in env (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`). Validate with `pnpm ops:stripe-env`.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm ops:stripe-env` | Validate Stripe env shape |
| `pnpm ops:waitlist` | Export waitlist (`-- --csv`) |
| `pnpm ops:pilot-invite` | Create invite (`CODE MAX_USES kind`) |
| `pnpm ops:pilot-batch` | Batch PAID-00N invites |
| `pnpm ops:pilot-invites` | List invites + redemption |
| `pnpm ops:pilot-wtp` | Record WTP / concierge flags |
| `pnpm ops:pilot-go-no-go` | Retention + paid snapshot |
| `pnpm ops:outreach-pack` | ICP CSV → invites + outbox |
| `pnpm ops:retention` | Accepted-PR retention only |
| `scripts/manual-billing-smoke.md` | Stripe Checkout + portal + webhook smoke |
| `scripts/manual-issue-wedge.md` | Primary issue→CI Accept operator proof |

Billing UI: Settings → **Billing** (`BillingPanel` polls after Checkout success).

## Contact

`hello@coppergate.ai` · site `https://www.coppergate.ai` · X/IG `@coppergateai` · [EMAIL.md](./EMAIL.md)
