/**
 * Adventurer state machine — guarded transitions.
 *
 * Spec: specs/behaviors/adventurer-entity.md#state-machine
 * Illegal transitions throw in development; in production the prior state is retained.
 */
import type { Adventurer, AdventurerState, QuestId } from '../world/types.js';

export class IllegalStateTransitionError extends Error {
  constructor(from: AdventurerState, to: AdventurerState, reason: string) {
    super(`Illegal state transition ${from} → ${to}: ${reason}`);
    this.name = 'IllegalStateTransitionError';
  }
}

type TransitionOpts = {
  questId: QuestId | null;
  isDev: boolean;
};

// Terminal states — no exit
const TERMINAL: ReadonlySet<AdventurerState> = new Set(['DEAD', 'RETIRED']);

// Legal transition map
const LEGAL: Partial<Record<AdventurerState, ReadonlySet<AdventurerState>>> = {
  IDLE: new Set(['ON_QUEST', 'RESTING', 'SOCIALIZING', 'IN_DISPUTE', 'RETIRED']),
  RESTING: new Set(['IDLE']),
  SOCIALIZING: new Set(['IDLE']),
  IN_DISPUTE: new Set(['IDLE', 'RETIRED']),
  ON_QUEST: new Set(['IN_DUNGEON', 'DEAD', 'IDLE', 'RESTING']),
  IN_DUNGEON: new Set(['ON_QUEST', 'DEAD']),
};

function reject(adventurer: Adventurer, to: AdventurerState, reason: string, isDev: boolean): Adventurer {
  if (isDev) throw new IllegalStateTransitionError(adventurer.state, to, reason);
  return adventurer;
}

export function transitionState(
  adventurer: Adventurer,
  to: AdventurerState,
  opts: TransitionOpts,
): Adventurer {
  const { questId, isDev } = opts;
  const from = adventurer.state;

  if (TERMINAL.has(from)) {
    return reject(adventurer, to, `${from} is a terminal state`, isDev);
  }

  const legalTargets = LEGAL[from];
  if (!legalTargets || !legalTargets.has(to)) {
    return reject(adventurer, to, `no legal transition defined`, isDev);
  }

  // Guard: ON_QUEST requires questId
  if (to === 'ON_QUEST' && questId === null) {
    return reject(adventurer, to, 'questId must be non-null when entering ON_QUEST', isDev);
  }

  // Guard: IN_DUNGEON requires questId
  if (to === 'IN_DUNGEON' && questId === null) {
    return reject(adventurer, to, 'questId must be non-null when entering IN_DUNGEON', isDev);
  }

  const newQuestId = (to === 'IDLE' || to === 'RESTING' || to === 'RETIRED' || to === 'DEAD')
    ? null
    : (questId ?? adventurer.currentQuestId);

  const next = { ...adventurer, state: to, currentQuestId: newQuestId };

  // Leaving the guild for a quest drops any in-progress home activity. The activity subscriber
  // skips questing adventurers, so a retained activityState freezes with a now-stale
  // scheduledExitAt and fires a spurious exit the instant the adventurer returns — e.g. narrating
  // "wakes from sleep" for someone who was away questing, not asleep. Cleared here, the subscriber
  // re-draws a fresh activity on return. (social-system.md §2)
  if (to === 'ON_QUEST' || to === 'IN_DUNGEON') delete next.activityState;

  return next;
}
