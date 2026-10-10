# Coppergate

AI-native product execution platform — idea → brief → plan → isolated coding run → PR + evidence → human review.

**Slogan:** Build inside the gate. Ship when you open it.

This is the product monorepo. Planning and ADRs live in [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) (private).

## Layout

```text
apps/
  web/                 # Next.js UI + BFF
  worker/              # Job poller / run executor
packages/              # domain, db, policy, github, agents, sandbox, llm, …
```

Scaffold lands in **TASK001** (see architecture backlog). Do not invent APIs that conflict with `coppergate-architecture` docs.

## Related repos

| Repo | Role |
|------|------|
| [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) | Private planning / ADRs / backlog |
| [`coppergate-examples`](https://github.com/coppergateai/coppergate-examples) | Next.js fixture for e2e / agent PRs |

## Status

Private. Implementation not started — waiting on Slice A / TASK001.
