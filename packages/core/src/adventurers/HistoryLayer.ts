/**
 * History Layer — contextual personality modifiers from past events.
 *
 * Spec: specs/behaviors/history-layer.md
 *
 * `contextualModifier` is a pure function: same (axes, history, context) → same result.
 * Returns an adjusted PersonalityAxes — values are never stored on the adventurer.
 * `appendHistoryEvent` maintains the 50-event FIFO cap.
 */
import type {
  PersonalityAxes,
  HistoryEvent,
  BehaviourContext,
} from '../world/types.js';

const MAX_HISTORY = 50;
const TICKS_PER_DAY = 24;

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v));
}

// ---------------------------------------------------------------------------
// Pure modifier
// ---------------------------------------------------------------------------

/**
 * Returns adjusted personality axes for the given behaviour context.
 * Never mutates inputs. Values clamped [0, 100].
 */
export function contextualModifier(
  axes: PersonalityAxes,
  historyEvents: HistoryEvent[],
  context: BehaviourContext,
): PersonalityAxes {
  let courage = axes.courage;
  let loyalty = axes.loyalty;
  let empathy = axes.empathy;
  const greed = axes.greed;
  const ambition = axes.ambition;

  for (const ev of historyEvents) {
    switch (ev.kind) {
      case 'WITNESSED_DEATH': {
        if (ev.enemyArchetype && context.enemyArchetype === ev.enemyArchetype) {
          courage -= 20;
        }
        break;
      }
      case 'NEAR_DEATH': {
        const elapsed = context.tick - ev.tick;
        if (elapsed <= 14 * TICKS_PER_DAY) {
          // Within 14 days: +15 confidence
          courage += 15;
        } else if (elapsed > 30 * TICKS_PER_DAY) {
          // After 30 days: -10 lingering trauma
          courage -= 10;
        }
        // Between 14d and 30d: no effect
        break;
      }
      case 'FIRST_KILL': {
        courage += 10;
        break;
      }
      case 'SAVED_BY': {
        // +15 loyalty toward the saver if they're in the current context
        if (context.involvedAdventurerIds?.some(id => ev.involvedIds.includes(id))) {
          loyalty += 15;
        }
        // +10 empathy in rescue scenarios
        if (context.questType === 'RESCUE') {
          empathy += 10;
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    courage: clamp(courage),
    greed,
    empathy: clamp(empathy),
    loyalty: clamp(loyalty),
    ambition,
  };
}

// ---------------------------------------------------------------------------
// History list management
// ---------------------------------------------------------------------------

/**
 * Append a new event to the history list, pruning the oldest if over 50.
 * Returns a new array — does not mutate the input.
 */
export function appendHistoryEvent(
  history: HistoryEvent[],
  event: HistoryEvent,
): HistoryEvent[] {
  const next = [...history, event];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}
