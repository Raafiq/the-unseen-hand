# The Unseen Hand — Agent Instructions

## Spec-driven development (specops)

This project uses spec-driven development. `specs/` is the source of truth for what
*should be true*; `plans/` is the work-in-flight DAG that bridges specs to merged code.
The **specops** skill carries the full methodology — invoke it (the skill triggers on
"spec", "plan", starting a feature, etc.) before writing specs, planning, or building.

- **Specs lead.** Before changing behavior, change the spec; bring code into conformance
  after. Spec↔code drift is a bug, not debt.
- **`plans/` is the planning system — not your built-in plan mode.** Every chunk of work
  lands as a file in `plans/` that freezes to `done` as the durable record of what got
  built. Don't let an ephemeral plan substitute for it, and don't skip it for "small"
  changes. (Classic trap: an ad-hoc plan of "write spec X, then build it" that ends with
  neither a reviewed spec nor a plan file — split those into the two real artifacts.)
- **When to author a plan depends on intent:** mapping out a batch of specs → finish the
  batch first, then propose a *set* of plans; speccing one bounded feature in a mature
  project → draft the spec change and its plan in tandem; intent unclear → ask. The skill
  details each mode.
- **A spec change ripples to its plans.** After editing a spec, review the plans that
  implement it (`grep -l '<spec-path>' plans/*.md`) and offer to update them.

Query the DAG:

```powershell
C:\Users\mdraa\.claude\skills\specops\scripts\specops next   # what to work on next
C:\Users\mdraa\.claude\skills\specops\scripts\specops dag    # dependency graph
```

Run `/audit-spec-drift` to compare specs against the implementation.

---

## Project guardrails

### TypeScript / Svelte verification

**Before any Svelte edit is considered verified:**
- `tsc --noEmit` must pass with zero errors.
- `svelte-check` must pass with zero errors.

Both must pass. A green `tsc` alone is insufficient.

### Svelte 5 store rule

```typescript
// ✅ Correct — object export with $state inside
export const simulationStore = $state({ adventurerMap: new Map(), divineInfluence: 50 });

// ❌ Wrong — triggers state_invalid_export
export let divineInfluence = $state(50);
```

Always use `export const store = $state({...})`. Never `export let x = $state(...)`.

### Testing rule — probability shifts, not outcomes

Tests must assert that a probability-shifting function **changes the probability value**,
not that the simulation **rolled a particular outcome**. Outcome tests are non-deterministic
by design (see `specs/principles.md#probability-shift-not-outcome-override`).

```typescript
// ✅ Correct
expect(applyDivineShift(baseProb, diAmount)).toBeGreaterThan(baseProb);

// ❌ Wrong — brittle, defeats the principle
expect(questOutcome.success).toBe(true);
```

### No Math.random()

All randomness flows through `SimulationContext.rng` (seeded PRNG). No module in
`packages/core` may call `Math.random()` directly. Verify with:

```powershell
grep -r "Math.random" packages/
```
