/**
 * Bot playtest harness — runs 30 in-game days headlessly under four strategies
 * and asserts core world-state invariants after every tick.
 *
 * No browser required. Run with: pnpm --filter @ugs/core test
 */
import { describe, it, expect } from 'vitest';
import { SimulationLoop, createScenario1Context, dispatch } from '@ugs/core';
import type { SimulationContext } from '@ugs/core';

// ---------------------------------------------------------------------------
// Invariant checker
// ---------------------------------------------------------------------------

type Violation = { tick: number; invariant: string; detail: string };

const VALID_STATES = new Set([
  'IDLE', 'ON_QUEST', 'IN_DUNGEON', 'RESTING',
  'SOCIALIZING', 'IN_DISPUTE', 'DEAD', 'RETIRED',
]);

function checkInvariants(ctx: SimulationContext): Violation[] {
  const v: Violation[] = [];
  const t = ctx.worldTime.tick;

  // Divine Influence
  if (!Number.isFinite(ctx.divineInfluence) || ctx.divineInfluence < 0 || ctx.divineInfluence > 100)
    v.push({ tick: t, invariant: 'DI_BOUNDS', detail: `divineInfluence=${ctx.divineInfluence}` });

  // Treasury and reputation sanity
  if (!Number.isFinite(ctx.treasury))
    v.push({ tick: t, invariant: 'TREASURY_NAN', detail: `treasury=${ctx.treasury}` });
  if (!Number.isFinite(ctx.reputation) || ctx.reputation < 0)
    v.push({ tick: t, invariant: 'REPUTATION_INVALID', detail: `reputation=${ctx.reputation}` });

  // Per-adventurer checks
  for (const [id, adv] of ctx.adventurers) {
    if (!VALID_STATES.has(adv.state))
      v.push({ tick: t, invariant: 'INVALID_STATE', detail: `${id} state="${adv.state}"` });

    if (!Number.isFinite(adv.mood) || adv.mood < 0 || adv.mood > 100)
      v.push({ tick: t, invariant: 'MOOD_BOUNDS', detail: `${id}(${adv.identity.name}) mood=${adv.mood}` });

    if (adv.despairStreak < 0)
      v.push({ tick: t, invariant: 'NEGATIVE_DESPAIR_STREAK', detail: `${id} despairStreak=${adv.despairStreak}` });

    // State-currentQuestId consistency
    if (adv.state === 'ON_QUEST' && !adv.currentQuestId)
      v.push({ tick: t, invariant: 'ON_QUEST_NO_QUEST_ID', detail: `${id} ON_QUEST but currentQuestId=null` });
    if ((adv.state === 'DEAD' || adv.state === 'RETIRED') && adv.currentQuestId)
      v.push({ tick: t, invariant: 'DEAD_HAS_QUEST_ID', detail: `${id} ${adv.state} but currentQuestId=${adv.currentQuestId}` });

    // Personality axes in [0, 100]
    for (const [axis, val] of Object.entries(adv.personality)) {
      if (!Number.isFinite(val as number) || (val as number) < 0 || (val as number) > 100)
        v.push({ tick: t, invariant: 'PERSONALITY_BOUNDS', detail: `${id} ${axis}=${val}` });
    }
  }

  // Dead/retired adventurers must not appear in active quest parties
  const activePartyIds = new Set(ctx.questBoard.active.flatMap(q => q.assignedParty ?? []));
  for (const id of activePartyIds) {
    const adv = ctx.adventurers.get(id);
    if (!adv)
      v.push({ tick: t, invariant: 'UNKNOWN_PARTY_MEMBER', detail: `${id} in quest party but missing from adventurers` });
    else if (adv.state === 'DEAD' || adv.state === 'RETIRED')
      v.push({ tick: t, invariant: 'DEAD_IN_PARTY', detail: `${id}(${adv.identity.name}) is ${adv.state} but in active quest` });
  }

  // No duplicate pending decision IDs
  const decisionIds = ctx.pendingDecisions.map(d => d.id);
  if (new Set(decisionIds).size !== decisionIds.length)
    v.push({ tick: t, invariant: 'DUPLICATE_DECISIONS', detail: `ids=[${decisionIds.join(', ')}]` });

  // Relationship strengths in [-100, 100]
  for (const [idA, edges] of ctx.relationships) {
    for (const [idB, edge] of edges) {
      if (!Number.isFinite(edge.strength) || edge.strength < -100 || edge.strength > 100)
        v.push({ tick: t, invariant: 'REL_STRENGTH_BOUNDS', detail: `${idA}↔${idB} strength=${edge.strength}` });
    }
  }

  return v;
}

// ---------------------------------------------------------------------------
// Session runner
// ---------------------------------------------------------------------------

const TICKS = 720; // 30 in-game days

type Strategy = 'passive' | 'reactive' | 'spender';

function runSession(strategy: Strategy): Violation[] {
  const loop = new SimulationLoop(createScenario1Context());
  const violations: Violation[] = [];
  let prevLogLength = 0;

  for (let i = 0; i < TICKS; i++) {
    loop.step();
    let ctx = loop.context;

    // Event log must never shrink
    if (ctx.eventLog.length < prevLogLength)
      violations.push({ tick: ctx.worldTime.tick, invariant: 'EVENT_LOG_SHRUNK', detail: `was ${prevLogLength}, now ${ctx.eventLog.length}` });
    prevLogLength = ctx.eventLog.length;

    violations.push(...checkInvariants(ctx));

    // Strategy-specific dispatch after invariant check
    if (strategy === 'reactive' || strategy === 'spender') {
      for (const moment of [...ctx.pendingDecisions]) {
        // Always pick option index 1 (first non-fate option); fall back to 0 if only one option
        const idx = moment.options.length > 1 ? 1 : 0;
        const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: moment.id, optionIndex: idx });
        if (result.ok) { ctx = result.ctx; loop.setContext(ctx); }
      }
    }

    if (strategy === 'spender') {
      // Burn remaining DI on MOOD_LIFT for every active adventurer
      for (const [id, adv] of ctx.adventurers) {
        if (adv.state === 'DEAD' || adv.state === 'RETIRED') continue;
        if (ctx.divineInfluence < 5) break;
        const result = dispatch(ctx, { type: 'DIVINE_TOUCH', adventurerId: id, effect: 'MOOD_LIFT', diCost: 5 });
        if (result.ok) { ctx = result.ctx; loop.setContext(ctx); }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function assertNoViolations(violations: Violation[], label: string): void {
  if (violations.length === 0) {
    expect(violations).toHaveLength(0);
    return;
  }
  const report = violations
    .slice(0, 25)
    .map(v => `  [tick ${String(v.tick).padStart(4)}] ${v.invariant}: ${v.detail}`)
    .join('\n');
  const suffix = violations.length > 25 ? `\n  … and ${violations.length - 25} more` : '';
  expect.fail(`${label} — ${violations.length} violation(s):\n${report}${suffix}`);
}

describe('bot playtest — core invariants (30 in-game days each)', () => {
  it('passive observer: no dispatch, watches the world run', () => {
    assertNoViolations(runSession('passive'), 'passive');
  });

  it('reactive bot: answers every decision moment', () => {
    assertNoViolations(runSession('reactive'), 'reactive');
  });

  it('spender bot: burns DI as fast as possible on mood lifts', () => {
    assertNoViolations(runSession('spender'), 'spender');
  });

  it('hoarder bot: never dispatches — DI accumulates and stays ≤ 100', () => {
    const loop = new SimulationLoop(createScenario1Context());
    const violations: Violation[] = [];
    for (let i = 0; i < TICKS; i++) {
      loop.step();
      violations.push(...checkInvariants(loop.context));
    }
    assertNoViolations(violations, 'hoarder');
  });
});
