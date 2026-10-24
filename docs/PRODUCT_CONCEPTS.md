# Coppergate product concepts

## Positioning

Coppergate is an **execution platform for AI software teams** — controlled, measurable, and verifiable. Agents write code; fitness gates, spend caps, and human Accept decide what ships.

## North star metric

**Verified Deliveries per Active Workspace**

Count of deliveries in a period that:

1. Passed required fitness / CI gates, and
2. Were accepted by a human (Accept → Done),

for workspaces with recent activity.

Opening a PR alone is not success. Prefer separate funnels for:

- PR opened
- Verified (gates green)
- Accepted (human)
- Merged (optional, policy-gated)

### Supporting metrics

| Metric | Meaning |
|--------|---------|
| Time to First Verified PR | Onboarding / first-value latency |
| Cost per Verified Delivery | Production economics |
| Gate Pass Rate | Verification quality |
| Human Rework Rate | How often Accept needs changes / retry |

## Core experience loop

```
Issue → Execution → Verification → Human Approval → Delivery
```

Surfaces:

- **Mission Control** (`/workspaces/[id]`) — what needs intervention now
- **Evidence** — why a delivery is acceptable
- **Arena** — which contender won and why (hard gates, then rank)
- **Delivery Review** (task detail) — Accept with explicit gate status

## Explicit non-goals (near term)

- Unbounded multi-agent orchestration
- Fully automatic production deploy
- General-purpose AI chat / IDE replacement
- Drag-and-drop workflow builders
- Agent marketplace / leaderboards without usage data
