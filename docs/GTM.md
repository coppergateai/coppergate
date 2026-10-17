# Coppergate GTM — path to $1M ARR

Operator playbook for the commercial wedge. Product north star remains the Survivor arena; revenue path is **hosted** Starter/Pro (MIT self-host = awareness, not the cash register).

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

1. Run outreach from [PILOT_OUTREACH.md](./PILOT_OUTREACH.md).
2. Export waitlist: `DATABASE_URL=… pnpm exec tsx scripts/list-waitlist.mjs`
3. Issue paid invites: `DATABASE_URL=… pnpm exec tsx scripts/create-pilot-invite.mjs PAID-XXXX 1 paid_pilot`
4. Concierge OK — but every delivery must show PR + evidence + cost in-product.
5. Go/no-go: `DATABASE_URL=… pnpm exec tsx scripts/pilot-go-no-go.mjs`

**Go** if: ≥1 pilot with second accepted PR **and** ≥3 paid (or committed deposit).  
**No-go:** narrow messaging to issue→PR only; soft-pedal Survivor theater until retention moves.

## Phase 1 — 60–90 days (monetize)

| Priority | Work |
|---|---|
| P0 | Stripe Starter/Pro checkout + customer portal ([pricing](/docs/pricing)) |
| P0 | Onboarding: connect → budget → import issue → PR in one session |
| P0 | Self-serve recovery ([/docs/recovery](/docs/recovery)) |
| P1 | Deepen Issue + Sentry/CI-fail only |
| P1 | Hero demo + shareable redacted reports + launch content ([LAUNCH_KIT.md](./LAUNCH_KIT.md)) |

## Phase 2 — 6–12 months

Retention habit → content distribution (IH/HN) → expand **only on pull** → Phase X harden for Team plan.

## Pricing hypotheses (validate in pilots)

| Plan | Hypothesized | Includes |
|---|---|---|
| Community | $0 | MIT self-host, BYOK, user-managed sandboxes |
| Starter | ~$49–99/mo + usage | Hosted sandboxes, modest concurrency |
| Pro | ~$149–199/mo + usage | Higher concurrency, previews, multi-project |
| Team | later | SSO, audit retention, shared budgets |

Exact Stripe Price IDs live in env (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`).

## Scripts

| Script | Purpose |
|---|---|
| `scripts/list-waitlist.mjs` | Export waitlist emails |
| `scripts/create-pilot-invite.mjs` | Create invite (`[CODE] [MAX_USES] [kind]`) |
| `scripts/list-pilot-invites.mjs` | List invites + redemption |
| `scripts/pilot-go-no-go.mjs` | Retention + paid invite snapshot |
| `scripts/retention-snapshot.mjs` | Accepted-PR retention only |
| `scripts/manual-billing-smoke.md` | Stripe Checkout + portal + webhook smoke |
| `scripts/manual-issue-wedge.md` | Primary issue→CI Accept operator proof |

Billing UI: Settings → **Billing** (`BillingPanel` polls after Checkout success).

## Contact

`hello@coppergate.ai` · site `https://www.coppergate.ai` · X/IG `@coppergateai`
