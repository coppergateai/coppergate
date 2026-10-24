---
title: Budget caps and kill-switches for agent spend
description: How Coppergate turns monthly spend caps into selection pressure — and why a hard kill-switch stays first-class.
date: 2026-10-21
slug: agent-budget-caps-kill-switch
---

Autonomous agents without a budget are a blank check. Coppergate treats spend as selection pressure: weak contenders burn allocation and drop out; arena-level caps hard-stop runaway cost.

## Caps at two levels

**Contender budgets** bound a single path. When a contender hits its cap, that path exits the pool. Other contenders can keep working until the arena resolves.

**Arena / workspace caps** bound the whole competition. They exist so one bad night cannot empty the wallet. You set the monthly spend story; the product enforces it.

Budgets are not a soft suggestion in the UI. They are part of how the arena decides who remains eligible and when the competition must stop. That is the difference between “we hope agents are thrifty” and “the system cannot overspend.”

## Kill-switch is not optional

You hold a global kill-switch. Cooperative cancel stops in-flight work; hard stop is available when you need the arena quiet immediately. Policy violations (secrets, forbidden paths) also halt work.

Budgets answer “how much can this path spend?” The kill-switch answers “stop everything now.” Both stay first-class in Mission Control and workspace settings.

Without a kill-switch, “autonomous” becomes “uninterruptible.” Coppergate keeps the interrupt — including when a signal-armed arena is not what you wanted after all.

## Cost efficiency, not cheapest-at-all-costs

Efficiency ranking rewards qualifying work relative to spend. Burning tokens without clearing fitness gates does not win. Surviving with evidence under budget does.

That is why chat-style “keep trying until it looks right” is a poor default under a shared pool. Selection pressure makes waste visible: losers lose budget; survivors ship a reviewable path. Cheap failures are still failures if CI never goes green.

## Failure modes you can recover from

When a budget trips mid-run, or CI Accept stays blocked, you should not need an operator. [Recovery](/docs/recovery) covers cancel, retry, stale leases, and kill-switch behavior for self-serve repair.

Common patterns:

- Contender exhausted → path exits; arena may still resolve from remaining contenders
- Arena cap hit → hard stop; inspect evidence and decide whether to re-arm with a tighter goal
- Kill-switch → quiet the workspace; fix policy or secrets; retry deliberately

For self-host pricing context (MIT, $0 with your own keys; paid hosted tiers deferred), see [Pricing](/docs/pricing). Access and credential posture are summarized on [Security](/security).

## Related reading

- [Multi-agent arena vs coding chat agents](/blog/multi-agent-arena-vs-chat)
- [Fitness gates — evidence before merge](/blog/fitness-gates-evidence-before-merge)
- [Landing FAQ](/#faq)
