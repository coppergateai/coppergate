# Launch kit — distribution content

Use with [GTM.md](./GTM.md). Prefer real cost/fail evidence over vapor.

## Hero demo (90s script)

1. Arm arena on a real repo (budget + kill-switch visible).
2. Import GitHub issue #N (or show Sentry/CI-fail signal arm).
3. Contenders fan out → fitness/CI → efficiency payoff.
4. Survivor opens PR with `Closes #N`, checks, cost ledger.
5. Share redacted delivery report URL.

Line: **“I armed an arena. Contenders fought. The survivor opened a tested PR.”**

## Channels

| Channel | Angle |
|---|---|
| Indie Hackers | Solo founder babysitting agents → spend-capped arena |
| Hacker News Show HN | Honest limitations + cost/accepted PR numbers |
| X / Instagram `@coppergateai` | Short tournament board clips + Selection thesis |
| Medium | Selection over Supervision (existing article) |

## Post templates

### Show HN

```
Show HN: Coppergate – agents compete; survivors open the PR

Wedge: GitHub issue → verified PR under a hard spend cap.
Selection (CI + efficiency) over human approval inbox.

Limitations: nextjs_ts strongest path; private beta invite-gated.
Happy to share median cost per accepted PR from design partners.
```

### Failed-run post (trust)

```
Arena run failed today — here's the ledger.

Task: {title}
Spend before fail: ${x}
Why: {ci_failed | sandbox | agent}
Recovery: Retry in-product (no operator). Docs: /docs/recovery

Selection pressure only works if failures are visible.
```

## Assets

- Shareable report: in-app **Share** on a completed run → `/share/r/{token}`
- Brand: `coppergate-architecture/brand/`
- Social: `docs/SOCIAL.md` in architecture repo

## Do not

- Inject promo text into customer PRs without opt-in attribution.
- Promise Bitbucket/ADO/SSO in public launch copy.
- Lead with org charts or chat-employee metaphors.
