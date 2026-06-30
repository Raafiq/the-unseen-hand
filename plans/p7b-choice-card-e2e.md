---
status: done
depends: [p7a-departure-shift-wiring]
specs:
  - specs/behaviors/departure-system.md
---

# P7b — Choice-card E2E test

## Scope

Playwright test confirming `ChoiceCard` renders in the right panel when
`pendingDecisions` is populated. Two tests cover: card visibility + content
correctness (situation text, option buttons), and expiry countdown display.

## Implements

- `specs/behaviors/departure-system.md` §Validation — DI opportunity renders in UI
- CLAUDE.md "UI verification — no manual browser gates" guardrail

## Approach

PARTY_SELECTION fires deterministically at tick 1 on the fixed 'scenario-1' seed:
any difficulty 7+ quest yields `computeQuestProbability < 0.30` with the initial
adventurer mood of 30 (mod: −0.04). Speed 20× ensures the moment fires well
within the 12s per-assertion timeout.

Two tests in `apps/game-client/tests/choice-card.spec.ts`:
1. `.primary-card` visible; `.situation-text` non-empty; `.option-btn` count > 0
2. `.expiry` element contains "ticks"

## Validation

- [x] Both choice-card tests pass (`2 passed`)
- [x] Full Playwright suite passes (`8 passed` including prior smoke tests)
- [x] Build clean (`vite build` 0 errors)

## Notes

Tests target `.primary-card` (inside `ChoiceCard.svelte`) rather than the
containing `.right-panel` to stay close to the component's own class names.
`toHaveCountGreaterThan` is not a Playwright API — used `expect(await count()).toBeGreaterThan(0)`.

## Follow-ups

- World map sidebar: region click should open a detail panel (specs/screens/world-map.md). → Polish
- Narrator E2E: Playwright route interception for VITE_CLAUDE_API_KEY. → Polish
