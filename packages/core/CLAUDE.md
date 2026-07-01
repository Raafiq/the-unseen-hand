# @ugs/core — Sim-engine guardrails

Deterministic simulation engine, no UI. Public API in `src/index.ts`. Domains:
`adventurers/`, `combat/`, `quests/`, `divine/`, `relationships/`, `events/`,
`world/`, `scenarios/`. These rules apply to work under `packages/core`; see the
root `CLAUDE.md` for commands, architecture, and the specops workflow.

### Verification

`tsc --noEmit` must pass with zero errors before any core edit is considered verified:

```powershell
pnpm --filter @ugs/core exec tsc --noEmit
```

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

### No Math.random()

All randomness flows through `SimulationContext.rng` (seeded PRNG). No module in
`packages/core` may call `Math.random()` directly. Verify with:

```powershell
grep -r "Math.random" packages/
```

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
