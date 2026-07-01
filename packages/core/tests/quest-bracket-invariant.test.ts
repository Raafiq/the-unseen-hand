/**
 * Quest-bracket ordering invariant.
 *
 * Spec: specs/behaviors/quest-system.md#quest-lifecycle-event-ordering
 *
 * Two layers:
 *   1. Unit-test the oracle (`findQuestBracketViolations`) against crafted logs so we trust it to
 *      catch regressions — a verifier that never fires is worthless.
 *   2. Run a real multi-day scenario and assert the live event log is bracket-clean. This is the
 *      first-class guard: any future change that lets combat (or any quest event) escape the
 *      [STARTED … COMPLETED] bracket fails here, without a bespoke per-symptom test.
 */
import { describe, it, expect } from 'vitest';
import {
  SimulationLoop,
  createScenario1Context,
  findQuestBracketViolations,
  emitEvent,
  createSimulationContext,
} from '@ugs/core';
import type { SimulationContext, SimulationEvent, SimulationEventInput } from '@ugs/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Emit a sequence of event inputs through one advancing context; return the resulting log. */
function logFrom(seed: string, inputs: SimulationEventInput[]): SimulationEvent[] {
  let ctx: SimulationContext = createSimulationContext(seed);
  for (const input of inputs) ctx = emitEvent(ctx, input);
  return ctx.eventLog;
}

const started = (q: string): SimulationEventInput => ({ kind: 'QUEST', subtype: 'STARTED', questId: q, partyIds: ['a'] });
const completed = (q: string): SimulationEventInput => ({ kind: 'QUEST', subtype: 'COMPLETED', questId: q, partyIds: ['a'] });
const failed = (q: string): SimulationEventInput => ({ kind: 'QUEST', subtype: 'FAILED', questId: q, partyIds: ['a'] });
const beatLog = (q: string): SimulationEventInput => ({ kind: 'COMBAT', subtype: 'BEAT_LOG', questId: q, involvedIds: ['a'] });

// ---------------------------------------------------------------------------
// Oracle unit tests — well-formed logs
// ---------------------------------------------------------------------------

describe('findQuestBracketViolations — accepts well-formed brackets', () => {
  it('a clean STARTED → BEAT_LOG → COMPLETED run has no violations', () => {
    expect(findQuestBracketViolations(logFrom('ok-success', [started('q1'), beatLog('q1'), completed('q1')]))).toEqual([]);
  });

  it('a failure bracket (STARTED → BEAT_LOG → FAILED) has no violations', () => {
    expect(findQuestBracketViolations(logFrom('ok-fail', [started('q1'), beatLog('q1'), failed('q1')]))).toEqual([]);
  });

  it('a quest still in progress (STARTED, no close yet) is not a violation', () => {
    expect(findQuestBracketViolations(logFrom('ok-open', [started('q1')]))).toEqual([]);
  });

  it('concurrent quests interleave freely — only per-quest order matters', () => {
    const log = logFrom('ok-concurrent', [
      started('q1'), started('q2'),      // two parties depart
      beatLog('q1'), completed('q1'),    // q1 resolves while q2 is still out
      beatLog('q2'), failed('q2'),       // q2 resolves later
    ]);
    expect(findQuestBracketViolations(log)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Oracle unit tests — each violation is actually caught
// ---------------------------------------------------------------------------

describe('findQuestBracketViolations — catches ordering violations', () => {
  it('BEAT_LOG after the close (the original "combat bleeds out of the bracket" bug)', () => {
    const log = logFrom('bug-bleed', [started('q1'), completed('q1'), beatLog('q1')]);
    const v = findQuestBracketViolations(log);
    expect(v.map(x => x.code)).toContain('EVENT_AFTER_CLOSE');
    expect(v[0]!.questId).toBe('q1');
  });

  it('a close with no preceding start', () => {
    const v = findQuestBracketViolations(logFrom('bug-nostart', [completed('q1')]));
    const codes = v.map(x => x.code);
    expect(codes).toContain('START_NOT_FIRST');
    expect(codes).toContain('CLOSE_WITHOUT_START');
  });

  it('combat before the quest opened', () => {
    const v = findQuestBracketViolations(logFrom('bug-early-combat', [beatLog('q1'), started('q1'), completed('q1')]));
    expect(v.map(x => x.code)).toContain('AWAY_BEFORE_START');
  });

  it('two closes for one quest', () => {
    const v = findQuestBracketViolations(logFrom('bug-2close', [started('q1'), beatLog('q1'), completed('q1'), failed('q1')]));
    const codes = v.map(x => x.code);
    expect(codes).toContain('MULTIPLE_CLOSES');
    expect(codes).toContain('EVENT_AFTER_CLOSE'); // the second close also trails the first
  });

  it('two BEAT_LOGs for one quest (guards the double-generation regression)', () => {
    const v = findQuestBracketViolations(logFrom('bug-2beat', [started('q1'), beatLog('q1'), beatLog('q1'), completed('q1')]));
    expect(v.map(x => x.code)).toContain('MULTIPLE_BEAT_LOGS');
  });

  it('reports one quest\'s violation without implicating a well-formed concurrent quest', () => {
    const log = logFrom('bug-mixed', [
      started('q1'), started('q2'),
      completed('q1'), beatLog('q1'),   // q1 bleeds
      beatLog('q2'), completed('q2'),   // q2 is clean
    ]);
    const v = findQuestBracketViolations(log);
    expect(v.length).toBeGreaterThan(0);
    expect(v.every(x => x.questId === 'q1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end — the live simulation stays bracket-clean
// ---------------------------------------------------------------------------

describe('quest-bracket invariant holds over a live simulation', () => {
  const TICKS = 720; // 30 in-game days — enough for many quests to start and resolve

  it('a 30-day scenario run produces zero bracket violations', () => {
    const loop = new SimulationLoop(createScenario1Context());
    for (let i = 0; i < TICKS; i++) loop.step();

    const log = loop.context.eventLog;

    // Guard against a vacuous pass: the run must actually exercise quest lifecycles.
    const starts = log.filter(e => e.kind === 'QUEST' && e.subtype === 'STARTED').length;
    const closes = log.filter(e => e.kind === 'QUEST' && (e.subtype === 'COMPLETED' || e.subtype === 'FAILED')).length;
    const beatLogs = log.filter(e => e.kind === 'COMBAT' && e.subtype === 'BEAT_LOG').length;
    expect(starts, 'expected several quests to start over 30 days').toBeGreaterThan(2);
    expect(closes, 'expected several quests to resolve').toBeGreaterThan(2);
    expect(beatLogs, 'expected fight reports for resolved quests').toBeGreaterThan(2);

    const violations = findQuestBracketViolations(log);
    if (violations.length > 0) {
      const report = violations.slice(0, 20).map(v => `  [${v.questId}] ${v.code}: ${v.detail}`).join('\n');
      expect.fail(`${violations.length} quest-bracket violation(s):\n${report}`);
    }
    expect(violations).toEqual([]);
  });
});
