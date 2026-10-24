# Product evolution log

## 2026-10-24 — Cycle 2 (post Mission Control triage)

### Discovered

| Problem | Evidence | Class |
|---------|----------|--------|
| Project Arena labeled **War arena** with military zones (Scout/Forge/Breach) | UX audit `18-project-arena.png`, hosted check text | Simplify — fights calm ops positioning |
| Evidence empty state pushes Arena Start over Import → queue | Evidence Center copy | Improve — wedge misaligned |
| Accept-ready deliveries only show generic “Review” | Evidence actions | Improve — next action unclear |
| Issue import blocked when no brief exists (existing_repo) | `issue-import.ts` + WEDGE ceremony | Improve — TTFV friction |

### Decisions

1. Keep Survivor selection metaphor; drop war/pit/breach framing in product UI.
2. Auto-seed a minimal **approved** brief on first issue import for `existing_repo` only (`new_product` still requires explicit brief).
3. Evidence Center CTAs: Import issue when empty; **Accept delivery** when gates are green.

### Implemented

- `arena-panel.tsx` / `arena-pitch.tsx` — operational Arena copy (Propose/Build/Ship, Start/Pause).
- `issue-import.ts` — `ensureBriefForIssueImport`.
- `evidence-panel.tsx` — wedge-first empty state + Accept CTA.

### Validation

- Unit: issue-import path covered by existing tests where present; add focused check if DB test harness available.
- Manual / Playwright: re-open project Arena + Evidence after deploy.

### Remaining opportunities

- Collapse Delivery badge noise vs Evidence failures.
- Align workspace Arena spectacle copy with the same operational language.
- Consider demoting project Arena visualization when concurrency crisis is active (link Pause only).

---

## 2026-10-24 — Cycle 3 (pricing lock + badge honesty)

### Discovered

| Problem | Evidence | Class |
|---------|----------|--------|
| Delivery tab badge counted **all** tasks (drafts/done/failed) | Project shell `taskCount={boardTasks.length}` → badge “6” | Simplify |
| Evidence had no badge for review-ready work | Same shell | Improve |
| Pilot outreach still sold $99/$199 | `PILOT_OUTREACH.md` vs product.txt pricing lock | Align |
| Billing note named Starter/Pro while paid off | Settings → Billing | Simplify |

### Decisions

1. Honor **no public paid pricing** — Community $0 only; outreach = design partners, not SKUs.
2. Tab badges = **actionable** counts only (in-flight delivery; REVIEW_REQUIRED on Evidence).

### Implemented

- `project-shell.tsx` / `page.tsx` — `deliveryCount` + `evidenceCount`.
- `billing-panel.tsx` — drop SKU names from “not offered” note.
- `changelog` historical Stripe line clarified as later deferred.
- `PILOT_OUTREACH.md` + `CONCIERGE_RUNBOOK.md` — design partners, no paid upsell.
- Hero: “Agents compete” (not “war”) — aligns with calm Survivor positioning.

### Validation

- Web typecheck clean for ProjectShell props.
- Hosted `pnpm check`: all assertions passed.
- Pricing page Community $0 only; `PUBLIC_PAID_PRICING_ENABLED=false`.

### Remaining opportunities

- ~~Workspace Arena spectacle: match project Arena operational language.~~ → Cycle 4
- ~~Failed Evidence rows: one-click Retry when retry API exists.~~ → Cycle 4

---

## 2026-10-24 — Cycle 4 (attention honesty + Evidence Retry)

### Discovered

| Problem | Evidence | Class |
|---------|----------|--------|
| Arena “needs attention” counted every budget-eliminated contender | UX audit: 83 need attention | Simplify — selection ≠ ops fire |
| Failed Evidence rows said “Retry” but only linked to Details | Evidence Center | Improve — incomplete feature |
| Workspace Arena lede was generic “Autonomous engineering operations” | arena-spectacle | Simplify |

### Decisions

1. Budget exhaustion alone is **idle** (Survivor selection). Escalate only live FAILED/BLOCKED/EXPIRED or stuck validation.
2. Evidence FAILED rows get one-click **Retry** → existing `/api/tasks/:id/retry`.

### Implemented

- `workspace-arena.ts` + mirrored `arena-spectacle.tsx` classifier.
- `evidence-panel.tsx` Retry button.
- Workspace Arena lede: compete → fitness/CI → Pause all.

### Validation

- `workspace-arena.test.ts` updated and run.
- Hosted e2e check if session available.

### Remaining opportunities

- ~~Default-expand projects that still need attention after the classifier fix.~~ → Cycle 5
- ~~Sort Evidence with Accept-ready / Failed first.~~ → Cycle 5

---

## 2026-10-24 — Cycle 5 (actionable Evidence + Arena focus)

### Discovered

| Problem | Evidence | Class |
|---------|----------|--------|
| Evidence list chronological — Accept-ready buried under verified | Evidence Center | Improve |
| Arena auto-expand picked any non-idle lane, not true attention | arena-spectacle | Improve |

### Decisions

1. Evidence order: Accept ready → Failed → Needs review → in-flight → other → verified.
2. First Arena expand prefers `needsAttention` lanes.

### Implemented

- `evidence-panel.tsx` `sortDeliveries` / `evidenceRank`.
- `arena-spectacle.tsx` expand init prefers attention.

### Validation

- Unit tests for classifier still green (Cycle 4).
- Typecheck web if dirty.

### Remaining opportunities

- ~~Inline Accept from Evidence (not only deep-link) when gates clear.~~ → Cycle 6
- Mission Control triage after attention metric honesty on live data.

---

## 2026-10-24 — Cycle 6 (Evidence Accept in place)

### Discovered

| Problem | Evidence | Class |
|---------|----------|--------|
| Accept-ready rows deep-linked to task detail for the same Accept | Evidence Center | Improve — extra step |

### Decisions

1. One-click **Accept** on Evidence when `REVIEW_REQUIRED` + `acceptReady` → `/api/tasks/:id/review`.
2. Keep Details link for inspection; primary CTA is Accept.

### Implemented

- `evidence-panel.tsx` `acceptDelivery` + Accept button.

### Validation

- Same CSRF/origin pattern as task-detail Accept.
- Web `tsc --noEmit` clean.

### Also (same cycle)

- Evidence summary chips: **accept ready / failed / verified** (was conflating Accept-ready with verified).

### Remaining opportunities

- ~~Mission Control live check after deploy (arenaNeedsAttention via Cycle 4 classifier).~~ → Cycle 7
- Hosted Playwright: Evidence Accept + Retry happy paths.

---

## 2026-10-24 — Cycle 7 (Mission Control ↔ Evidence)

### Discovered

| Problem | Evidence | Class |
|---------|----------|--------|
| Accept-ready tasks in attention list but omitted from Needs attention number | mission-control metric = inbox + arena only | Improve — dishonest metric |
| Review CTAs deep-linked to task detail, skipping Evidence Accept | mission-control.ts review_required href | Improve |

### Decisions

1. Add `needsEvidenceAccept` (REVIEW_REQUIRED count) into the attention total.
2. Attention rows + metric CTA land on `?tab=evidence`.

### Implemented

- `packages/db/src/mission-control.ts` metric + Evidence href/copy.
- `mission-control.tsx` total + meta: inbox · evidence · arena; status line for Accept-ready.

### Validation

- Web/db typecheck.
- Classifier tests still green.

### Remaining opportunities

- Hosted Playwright: Evidence Accept + Retry + MC attention count.
- Inbox empty state could deep-link Evidence when Accept-ready exists.
