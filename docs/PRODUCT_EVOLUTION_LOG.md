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
