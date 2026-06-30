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

**Corollary — asserting `pendingShift` consumption via guaranteed outcome:**
When the invariant being tested IS "this shift blocks the outcome entirely",
use a shift `>= max(prob)` so `effectiveProb = max(0, prob − shift) = 0`.
Since `rng.next()` always returns ≥ 0, the outcome never fires — making
the state assertion deterministic.

```typescript
// ✅ shift = 0.40 = max departure prob → effectiveProb = 0 → never departs
const pendingShifts = new Map([['a', 0.40]]);
const result = departureSubscriber({ ...ctx, adventurers, pendingShifts });
expect(result.adventurers.get('a')!.state).toBe('IDLE'); // deterministic
```

Only valid when the test goal is to verify the shift is consumed and applied —
not as a general substitute for probability assertions.

### No Math.random()

All randomness flows through `SimulationContext.rng` (seeded PRNG). No module in
`packages/core` may call `Math.random()` directly. Verify with:

```powershell
grep -r "Math.random" packages/
```

### Svelte project setup — svelte.config.js is required

Any Svelte app in this monorepo needs **both** `vite.config.ts` and `svelte.config.js`.
`svelte-check` resolves the preprocessor from `svelte.config.js`, not from the Vite
plugin — without it, `svelte-check` fails with "No Svelte configuration found."

```javascript
// svelte.config.js — must exist alongside vite.config.ts
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

### Testing rule — test through the subscriber, not the underlying function

Subscribers are the authoritative write sites for side effects (milestones, DI bursts,
lifecycle events, `pendingShifts`). The pure functions they call (e.g. `resolveQuest`)
do not produce these effects. Always route tests for subscriber-owned behavior through
the subscriber itself with a properly constructed `SimulationContext`.

```typescript
// ✅ Correct — routes through questResolutionSubscriber, which writes milestones
const next = questResolutionSubscriber(ctx);
expect(next.adventurers.get(id)?.personalGoalProgress.milestones).toContain('DUNGEON_SUCCESS');

// ❌ Wrong — resolveQuest never writes milestones; test will always fail
const result = resolveQuest(quest, party, ctx);
expect(result.milestones).toContain('DUNGEON_SUCCESS');
```

### UI display rule — enum labels use typed Records, not string replace

When an enum value needs a human-readable label in the UI, define a
`Record<EnumType, string>` lookup. Never use `.replace(/_/g, ' ')` as a
fallback — it silently handles unknown values and hides gaps that TypeScript
would otherwise catch at compile time.

```typescript
// ✅ Correct — TypeScript enforces all WorldEventType values are present
const EVENT_LABELS: Record<WorldEventType, string> = {
  STORM: 'Storm', MONSTER_SURGE: 'Monster Surge', TRAVELLING_MERCHANT: 'Travelling Merchant', ...
};

// ❌ Wrong — replace fallback masks missing cases
return EVENT_OPTIONS.find(o => o.type === type)?.label ?? type.replace(/_/g, ' ');
```

Also: a `never`-typed default branch in an exhaustive switch means the switch
already covers all cases — applying `.replace()` there causes a TS error and
indicates no fix is needed.

**EventFeed.svelte requires three updates per new EventKind:** `KIND_LABELS`
(the exhaustive `Record<EventKind, ...>`), `ALL_KINDS` (the array used for
filter rendering), and `getInvolvedIds` (which must handle any participant
fields the new event type carries — `participantIds`, `involvedIds`, `partyIds`,
`adventurerId`, etc.). `tsc` catches a missing `KIND_LABELS` entry but does NOT
catch missing `ALL_KINDS` or `getInvolvedIds` entries — the kind simply won't
appear in the feed or character filter.

### Testing rule — createSimulationContext always needs a seed

`createSimulationContext()` requires a seed string argument. Calling it without
one crashes at runtime in `xmur3` with `TypeError: Cannot read properties of
undefined (reading 'length')` — there is no compile-time guard.

```typescript
// ✅ Correct
const ctx = createSimulationContext('test-seed');

// ❌ Wrong — runtime crash
const ctx = createSimulationContext();
```

### Testing rule — roster-sensitive index arithmetic

When a test slices `[...ctx.adventurers.keys()]` by a hardcoded count, it
silently misbehaves if the roster size changes (e.g. `ids.slice(0, 4)` on a
3-element array kills everyone, leaving 0 survivors instead of the intended 2).
Use computed offsets tied to the actual roster size:

```typescript
// ✅ Correct — survives roster changes
const ids = [...ctx.adventurers.keys()];
const ctxWith1Dead = killAdventurers(ctx, ids.slice(0, 1)); // kill 1 → N-1 remain

// ❌ Brittle — hardcoded count exceeds roster after a roster resize
const ctxWith2Dead = killAdventurers(ctx, ids.slice(0, 4)); // silently kills all 3
```

### UI verification — no manual browser gates

All UI validation must be automated. Do not leave a plan validation step that requires
a human to open a browser. Use Playwright (`apps/game-client/tests/`) targeting
`vite preview` (built output) as the `webServer`. Add a `test:e2e` script to the
package. Replace any "verify in browser" checklist item with a concrete Playwright
assertion before calling a plan done.

### Decision moment rule — per-tick detectors need a cooldown key

Any `detectConditions` block that re-evaluates an ongoing condition every tick
(e.g. PARTY_SELECTION, DEPARTURE) must use `cooldownKey` + `decisionCooldowns`
to prevent re-fire after the player dismisses the card or it expires.

- Set `cooldownKey` on the moment (e.g. `"PARTY_SELECTION:${quest.id}"`)
- Check `(next.decisionCooldowns.get(cooldownKey) ?? 0) > tick` before firing
- Check `next.pendingDecisions.some(m => m.cooldownKey === cooldownKey)` for the active-pending guard
- `handleExpiry` and `chooseOption` both write the cooldown automatically for
  any moment that carries a `cooldownKey` — no extra wiring needed

One-shot detectors (triggered by a specific event firing on a specific tick) don't
need this — they can't re-trigger unless the triggering event fires again.

### Store rule — auto-pause must save and restore speed

When `simulationStore` auto-pauses the loop for a game-state condition (e.g. a new
decision moment appears), it must:
1. Save `simulationStore.speedBeforePause` before calling `setSpeed('paused')`
2. Call `setSpeed(simulationStore.speedBeforePause)` when the condition clears

Failing to restore speed leaves the loop permanently paused after the player acts.
