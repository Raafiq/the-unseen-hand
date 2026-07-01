/**
 * Quest-bracket ordering invariant.
 *
 * Spec: specs/behaviors/quest-system.md#quest-lifecycle-event-ordering
 *
 * A single quest run must surface in the feed as a well-formed *bracket*: it opens with
 * `QUEST:STARTED`, contains the away-quest combat report(s) in the middle, and closes with
 * exactly one `QUEST:COMPLETED` / `QUEST:FAILED`. Nothing tied to that quest may appear after the
 * close — combat must not "bleed" past the bracket, and the outcome must not be announced before
 * the fight it summarises.
 *
 * This module is the canonical, reusable oracle for that invariant: a pure function over an event
 * log, used by tests (and available to dev tooling) so the property is enforced in one place
 * rather than re-checked ad hoc each time a new event is threaded through quest resolution.
 */
import type { SimulationEvent, QuestId } from '../world/types.js';

/** A single ordering violation, keyed to the offending quest with a human-readable detail. */
export type QuestBracketViolation = {
  questId: QuestId;
  code:
    | 'START_NOT_FIRST'      // the first bracket event for the quest is not QUEST:STARTED
    | 'AWAY_BEFORE_START'    // a COMBAT event precedes QUEST:STARTED
    | 'MULTIPLE_STARTS'      // more than one QUEST:STARTED for the same quest
    | 'MULTIPLE_CLOSES'      // more than one COMPLETED/FAILED for the same quest
    | 'MULTIPLE_BEAT_LOGS'   // more than one COMBAT:BEAT_LOG for the same quest
    | 'CLOSE_WITHOUT_START'  // a close event with no preceding QUEST:STARTED
    | 'EVENT_AFTER_CLOSE';   // any bracket event emitted after the quest closed (the "bleed")
  detail: string;
};

type Role = 'open' | 'away' | 'close';
type Tagged = { role: Role; label: string };

const CLOSER = new Set(['COMPLETED', 'FAILED']);

/**
 * Returns every quest-bracket ordering violation in `events`, in quest order. An empty array means
 * every quest's bracket events are well-ordered. Only the questId-bearing bracket events are
 * considered (`QUEST:STARTED`/`COMPLETED`/`FAILED` and any `COMBAT:*`); other events, and a quest
 * that is still in progress at the end of the log (opened but not yet closed), are not violations.
 *
 * Concurrent quests are fine: events are partitioned by `questId`, so interleaving across quests
 * never trips the check — only the per-quest relative order matters.
 */
export function findQuestBracketViolations(
  events: readonly SimulationEvent[],
): QuestBracketViolation[] {
  // Partition the bracket events per quest, preserving log order.
  const byQuest = new Map<QuestId, Tagged[]>();
  const push = (questId: QuestId, tagged: Tagged): void => {
    const seq = byQuest.get(questId);
    if (seq) seq.push(tagged);
    else byQuest.set(questId, [tagged]);
  };

  for (const e of events) {
    if (e.kind === 'QUEST') {
      const role: Role | null = e.subtype === 'STARTED' ? 'open' : CLOSER.has(e.subtype) ? 'close' : null;
      if (!role) continue; // EXPIRED/DROUGHT are not part of a quest-run bracket
      push(e.questId, { role, label: `QUEST:${e.subtype}` });
    } else if (e.kind === 'COMBAT') {
      push(e.questId, { role: 'away', label: `COMBAT:${e.subtype}` });
    }
  }

  const violations: QuestBracketViolation[] = [];
  for (const [questId, seq] of byQuest) {
    const add = (code: QuestBracketViolation['code'], detail: string): void => {
      violations.push({ questId, code, detail });
    };

    const opens = seq.filter(s => s.role === 'open');
    const beatLogs = seq.filter(s => s.label === 'COMBAT:BEAT_LOG');
    const firstCloseIdx = seq.findIndex(s => s.role === 'close');
    const closes = seq.filter(s => s.role === 'close');

    if (seq[0]!.role !== 'open') {
      add('START_NOT_FIRST', `first bracket event is ${seq[0]!.label}, expected QUEST:STARTED`);
    }
    if (opens.length > 1) add('MULTIPLE_STARTS', `${opens.length} QUEST:STARTED events`);
    if (closes.length > 1) add('MULTIPLE_CLOSES', `${closes.length} closing events`);
    if (beatLogs.length > 1) add('MULTIPLE_BEAT_LOGS', `${beatLogs.length} COMBAT:BEAT_LOG events`);

    // An away event before the quest opened.
    const firstOpenIdx = seq.findIndex(s => s.role === 'open');
    seq.forEach((s, i) => {
      if (s.role === 'away' && (firstOpenIdx < 0 || i < firstOpenIdx)) {
        add('AWAY_BEFORE_START', `${s.label} emitted before QUEST:STARTED`);
      }
    });

    if (firstCloseIdx >= 0) {
      if (!seq.slice(0, firstCloseIdx).some(s => s.role === 'open')) {
        add('CLOSE_WITHOUT_START', `${seq[firstCloseIdx]!.label} with no preceding QUEST:STARTED`);
      }
      // Nothing may follow the close — that is combat (or anything) bleeding past the bracket.
      for (const s of seq.slice(firstCloseIdx + 1)) {
        add('EVENT_AFTER_CLOSE', `${s.label} emitted after the quest closed (${seq[firstCloseIdx]!.label})`);
      }
    }
  }
  return violations;
}
