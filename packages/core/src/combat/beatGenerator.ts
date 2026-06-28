/**
 * Combat beat generator — narrative reconstruction of quest outcomes.
 *
 * Spec: specs/behaviors/combat-resolution.md
 * Beats are generated AFTER the success/failure roll; they dramatise the
 * pre-determined outcome rather than re-rolling it.
 * All randomness via SeededRNG. No Math.random().
 */
import type {
  Quest,
  Adventurer,
  AdventurerId,
  BeatAction,
  CombatBeat,
  RelationshipGraph,
} from '../world/types.js';
import type { SeededRNG } from '../world/SeededRNG.js';
import { strengthToType } from '../relationships/graph.js';

// ---------------------------------------------------------------------------
// Action weight table
// ---------------------------------------------------------------------------

type WeightTable = Record<BeatAction, number>;

const BASE_WEIGHTS: WeightTable = {
  ATTACK:      0.45,
  HESITATE:    0.10,
  DEFEND_ALLY: 0.05,
  FLEE:        0.05,
  USE_ITEM:    0.05,
  CRITICAL:    0.15,
  NEAR_DEATH:  0.15,
};

function clampTable(t: WeightTable): WeightTable {
  const out = { ...t };
  for (const k of Object.keys(out) as BeatAction[]) {
    if (out[k] < 0) out[k] = 0;
  }
  return out;
}

function normalizeTable(t: WeightTable): WeightTable {
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  if (total === 0) return { ...BASE_WEIGHTS };
  const out = { ...t };
  for (const k of Object.keys(out) as BeatAction[]) {
    out[k] /= total;
  }
  return out;
}

/**
 * Returns the normalized probability table for a single beat.
 * Exported for testing probability shifts.
 */
export function selectBeatActionWeights(
  actor: Adventurer,
  party: Adventurer[],
  graph: RelationshipGraph,
  success: boolean,
  beatIndex: number,
  totalBeats: number,
): WeightTable {
  const t = { ...BASE_WEIGHTS };
  const { courage, loyalty, empathy } = actor.personality;

  // Losing-fight condition: failure outcome AND past 40% of beats
  const losingFight = !success && beatIndex > totalBeats * 0.4;
  if (courage < 30 && losingFight) {
    t.FLEE     += 0.35;
    t.ATTACK   -= 0.20;
    t.HESITATE += 0.15;
  }

  // Ally-near-death: check if previous beats had NEAR_DEATH from another party member
  // (simplified: treat any beat after 60% progress in failure as ally potentially at risk)
  const allyNearDeath = !success && beatIndex > totalBeats * 0.6;
  const allies = party.filter(a => a.id !== actor.id);

  if (allyNearDeath && allies.length > 0) {
    if (loyalty > 70) t.DEFEND_ALLY += 0.40;
    if (empathy > 60) t.DEFEND_ALLY += 0.20;
    const ally = allies[0]!;
    const edge = graph.get(actor.id)?.get(ally.id);
    if (edge && strengthToType(edge.strength) === 'TRUSTED_COMPANION') {
      t.DEFEND_ALLY += 0.30;
    }
    if (edge && strengthToType(edge.strength) === 'RIVAL') {
      t.HESITATE     += 0.25;
      t.DEFEND_ALLY  -= 0.25;
    }
  }

  // Outcome modifiers
  if (success) {
    t.CRITICAL += 0.15;
    t.FLEE     -= 0.10;
  } else {
    t.FLEE     += 0.15;
    t.CRITICAL -= 0.10;
  }

  return normalizeTable(clampTable(t));
}

function pickAction(weights: WeightTable, rng: SeededRNG): BeatAction {
  const roll = rng.next();
  let cumulative = 0;
  for (const [action, prob] of Object.entries(weights) as [BeatAction, number][]) {
    cumulative += prob;
    if (roll < cumulative) return action;
  }
  return 'ATTACK';
}

// ---------------------------------------------------------------------------
// Personality note
// ---------------------------------------------------------------------------

function generatePersonalityNote(
  actor: Adventurer,
  action: BeatAction,
  party: Adventurer[],
  graph: RelationshipGraph,
  losingFight: boolean,
): string | undefined {
  const { courage, loyalty, empathy } = actor.personality;
  const allies = party.filter(a => a.id !== actor.id);
  const ally = allies[0];
  const edge = ally ? graph.get(actor.id)?.get(ally.id) : undefined;
  const edgeType = edge ? strengthToType(edge.strength) : undefined;

  if ((action === 'FLEE' || action === 'HESITATE') && courage < 30) {
    return `courage ${courage} — breaks before the odds`;
  }
  if (action === 'ATTACK' && courage > 65 && losingFight) {
    return `courage ${courage} — refuses to yield`;
  }
  if (action === 'DEFEND_ALLY' && loyalty > 70 && edgeType === 'STRANGER') {
    return `loyalty ${loyalty} — stands by a near-stranger without hesitation`;
  }
  if (action !== 'DEFEND_ALLY' && empathy < 20 && edgeType === 'TRUSTED_COMPANION') {
    return `empathy ${empathy} — cannot bring themselves to intervene`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Beat generation
// ---------------------------------------------------------------------------

export function generateBeats(
  quest: Quest,
  party: Adventurer[],
  graph: RelationshipGraph,
  rng: SeededRNG,
  success: boolean,
): CombatBeat[] {
  const base = quest.difficulty * 3 + party.length * 2;
  const variance = (rng.next() * 0.4 - 0.2); // ±20%
  const count = Math.max(1, Math.round(base * (1 + variance)));

  const beats: CombatBeat[] = [];
  for (let i = 0; i < count; i++) {
    const actor = party[i % party.length]!;
    const weights = selectBeatActionWeights(actor, party, graph, success, i, count);
    const action = pickAction(weights, rng);
    const losingFight = !success && i > count * 0.4;
    const personalityNote = generatePersonalityNote(actor, action, party, graph, losingFight);

    beats.push({
      tick: i,
      actorId: actor.id,
      action,
      outcome: OUTCOME_DESCRIPTORS[action],
      ...(personalityNote ? { personalityNote } : {}),
    });
  }
  return beats;
}

const OUTCOME_DESCRIPTORS: Record<BeatAction, string> = {
  ATTACK:      'lands a solid blow',
  FLEE:        'retreats from the field',
  DEFEND_ALLY: 'shields an ally from harm',
  HESITATE:    'freezes at a critical moment',
  USE_ITEM:    'draws on a carried resource',
  CRITICAL:    'strikes a decisive blow',
  NEAR_DEATH:  'is brought to the brink',
};

// ---------------------------------------------------------------------------
// Beat template engine
// ---------------------------------------------------------------------------

const TEMPLATES: Record<BeatAction, string[]> = {
  ATTACK: [
    '{actor} drives forward with a powerful strike.',
    '{actor} presses the attack, giving no quarter.',
    '{actor} finds an opening and exploits it.',
  ],
  FLEE: [
    '{actor} breaks formation and retreats.',
    '{actor} turns and flees, survival overriding duty.',
    '{actor} backs away from the fight, eyes wide.',
  ],
  DEFEND_ALLY: [
    '{actor} throws themselves in front of {ally}, taking the blow meant for them.',
    '{actor} shouts a warning and drags {ally} clear just in time.',
    '{actor} steps between {ally} and the attacker without a word.',
  ],
  HESITATE: [
    '{actor} hesitates at a critical moment, failing to act.',
    '{actor} freezes, unable to commit to the fight.',
    '{actor} falters, doubt written across their face.',
  ],
  USE_ITEM: [
    '{actor} draws a flask and drinks deeply, steadying their nerves.',
    '{actor} reaches for a potion at the worst possible moment.',
    '{actor} fumbles with a pack, searching for something useful.',
  ],
  CRITICAL: [
    '{actor} finds a gap in the enemy\'s defences and strikes true.',
    '{actor} lands a decisive blow that shifts the momentum.',
    '{actor} seizes the initiative and delivers a crushing attack.',
  ],
  NEAR_DEATH: [
    '{actor} takes a grievous wound and staggers.',
    '{actor} is struck down and barely holds on.',
    '{actor} comes within a hair\'s breadth of death.',
  ],
};

/** Renders a CombatBeat as a narrative sentence. */
export function renderBeat(beat: CombatBeat, adventurerMap: Map<AdventurerId, Adventurer>): string {
  const templates = TEMPLATES[beat.action];
  // Deterministic variant selection: hash beat tick + actor to pick template
  const variantIdx = (beat.tick * 31 + beat.actorId.charCodeAt(0)) % templates.length;
  const template = templates[variantIdx]!;

  const actorName = adventurerMap.get(beat.actorId)?.identity.name ?? beat.actorId;
  const ally = [...adventurerMap.entries()]
    .find(([id]) => id !== beat.actorId)?.[1]?.identity.name ?? 'a companion';

  const rendered = template
    .replace('{actor}', actorName)
    .replace('{ally}', ally);

  return beat.personalityNote ? `${rendered} (${beat.personalityNote})` : rendered;
}
