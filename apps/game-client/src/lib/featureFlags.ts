/**
 * Feature flags for temporarily hiding areas of the game while we focus testing
 * on others. Flip a flag back to `true` to restore the feature fully — every UI
 * gate reads from here, and the e2e specs skip/adjust off this same source, so a
 * single edit re-enables both the surface and its tests.
 *
 * Current focus: Events + Relationships. Hidden for now:
 *   - `quests`  — the Quests nav tab + quest board panel.
 *   - `world`   — the World nav tab + region map/sidebar panel.
 *   - `divineIntervention` — the DI meter and floating DI deltas (topbar), the
 *     Divine Touch actions (character detail), and decision-moment ChoiceCards
 *     (right panel) along with their auto-pause.
 */
export const FEATURES = {
  quests: false,
  world: false,
  divineIntervention: false,
} as const;

/**
 * Event kinds to suppress from the Events feed, its filter chips, and the unread
 * badge count while the owning feature is hidden. Returned as plain strings so
 * this module stays free of engine-type imports; callers match them against
 * `SimulationEvent['kind']`. Flip the owning flag to `true` and the kind returns.
 */
export function hiddenEventKinds(): ReadonlySet<string> {
  const hidden = new Set<string>();
  if (!FEATURES.quests) {
    hidden.add('QUEST');
    // Combat is quest-derived — both COMBAT subtypes are emitted only by the
    // quest system (questId required), so they belong to the quests feature.
    // Relationship drama (saved-by, deaths, betrayals) rides on SOCIAL/LIFECYCLE
    // events and character history, not COMBAT, so it survives this.
    hidden.add('COMBAT');
  }
  if (!FEATURES.world) hidden.add('WORLD');
  if (!FEATURES.divineIntervention) {
    hidden.add('DIVINE');
    hidden.add('DECISION_MOMENT');
  }
  return hidden;
}

/**
 * Per-adventurer history entry kinds (`HistoryEvent['kind']`) to suppress from
 * the character-detail History list while the owning feature is hidden — the
 * quest system and divine touches still write history the engine needs, so we
 * hide only the display. Plain strings, same rationale as `hiddenEventKinds`.
 */
export function hiddenHistoryKinds(): ReadonlySet<string> {
  const hidden = new Set<string>();
  if (!FEATURES.quests) {
    // Quest/combat-derived personal milestones. The interpersonal beats
    // (SAVED_BY, WITNESSED_DEATH, BETRAYED_BY, GOAL_ACHIEVED) are relationship
    // content and stay visible.
    hidden.add('QUEST_TRIUMPH');
    hidden.add('FIRST_KILL');
    hidden.add('NEAR_DEATH');
  }
  if (!FEATURES.divineIntervention) {
    hidden.add('LUCK_CURSE');
    hidden.add('MARK_FOR_DEATH');
    hidden.add('SEND_DREAM');
  }
  return hidden;
}
