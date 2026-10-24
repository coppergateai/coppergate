---
title: Fitness gates — evidence before merge
description: How Coppergate uses CI, validation, and delivery evidence so agents compete on shippable work, not vibes.
date: 2026-10-22
slug: fitness-gates-evidence-before-merge
---

An agent that “says it works” is not a delivery. Coppergate promotes paths that clear **fitness gates** — verification signals such as CI, validation checks, and policy constraints — before anything approaches merge.

## Evidence is the ranking input

Inside an armed arena, contenders fan out. The worker resolves among qualifying runs using efficiency payoff. Paths that fail hard gates do not get to win on polish or volume of tokens.

The Delivery Review surface walks Scope → Execution → Verification → Review → Delivery. Accept stays blocked while hard gates (CI, validation, policy) are closed. Soft signals inform judgment; they do not silently override red CI.

## Human review stays at the boundary

Fitness gates promotion **inside** the arena. Production and default-branch writes stay policy-gated for human review. You set goal, policy, and spend cap; you keep the kill-switch. Autonomy does not mean unattended merges to `main`.

## A sharper wedge than “AI coding”

Coppergate’s wedge is narrower than a general chat agent: **GitHub issue → verified PR** with spend caps, kill-switch, and evidence you can inspect. That story is documented on [Security](/security), [Limitations](/docs/limitations), and the [landing FAQ](/#faq).

If you are evaluating agents on demo transcripts alone, add one more question: *what evidence would block a bad merge?*
