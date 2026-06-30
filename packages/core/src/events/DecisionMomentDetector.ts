import type { SimulationContext, DecisionMoment, DecisionMomentKind, Adventurer } from '../world/types.js';
import { emitEvent } from './eventBus.js';
import { grantDI } from '../divine/DivineInfluence.js';
import { computeDepartureProbability } from '../adventurers/departureSystem.js';
import { computeQuestProbability } from '../quests/questSystem.js';
import { narrativeDistance } from '../divine/ProbabilityShifter.js';
import { getScenario } from '../scenarios/ScenarioEngine.js';

// ---------------------------------------------------------------------------
// Priority (lower index = higher priority, dropped last)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: DecisionMomentKind[] = [
  'DEATH_IMMINENT',
  'RELATIONSHIP_COLLAPSE',
  'DEPARTURE',
  'SCENARIO_CRITICAL',
  'SCENARIO_GOAL',
  'PARTY_SELECTION',
  'OTHER',
];

function priority(kind: DecisionMomentKind): number {
  const idx = PRIORITY_ORDER.indexOf(kind);
  return idx === -1 ? PRIORITY_ORDER.length : idx;
}

// ---------------------------------------------------------------------------
// Expiry windows (ticks)
// ---------------------------------------------------------------------------

const EXPIRY_WINDOW: Record<DecisionMomentKind, number> = {
  DEATH_IMMINENT: 12,
  RELATIONSHIP_COLLAPSE: 24,
  DEPARTURE: 12,
  SCENARIO_CRITICAL: 48,
  SCENARIO_GOAL: 24,
  PARTY_SELECTION: 6,
  OTHER: 24,
};

// ---------------------------------------------------------------------------
// DI rewards on expiry
// ---------------------------------------------------------------------------

const DI_REWARD_ON_EXPIRY: Partial<Record<DecisionMomentKind, number>> = {
  DEATH_IMMINENT: 10,
};

// ---------------------------------------------------------------------------
// Expiry processing
// ---------------------------------------------------------------------------

const DECISION_COOLDOWN_TICKS = 48; // 2 days before re-firing a dismissable decision

function handleExpiry(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick;
  const expired = ctx.pendingDecisions.filter(m => tick >= m.expiresAt);
  if (expired.length === 0) return ctx;

  const decisionCooldowns = new Map(ctx.decisionCooldowns);
  for (const moment of expired) {
    if (moment.cooldownKey) {
      decisionCooldowns.set(moment.cooldownKey, tick + DECISION_COOLDOWN_TICKS);
    }
  }

  let next: SimulationContext = {
    ...ctx,
    pendingDecisions: ctx.pendingDecisions.filter(m => tick < m.expiresAt),
    decisionCooldowns,
  };

  for (const moment of expired) {
    next = emitEvent(next, { kind: 'DIVINE', subtype: 'OPTION_CHOSEN', diDelta: 0 });
    const reward = DI_REWARD_ON_EXPIRY[moment.kind];
    if (reward) {
      next = grantDI(next, reward);
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Detection — add new moments from current-tick conditions
// ---------------------------------------------------------------------------

type CandidateMoment = Omit<DecisionMoment, 'id'>;

function buildId(rng: SimulationContext['rng']): string {
  const n = (rng.next() * 0xFFFFFF >>> 0).toString(16).padStart(6, '0');
  return `dm-${n}`;
}

function addMoment(ctx: SimulationContext, candidate: CandidateMoment): SimulationContext {
  const MAX_ACTIVE = 3;
  const current = ctx.pendingDecisions;

  if (current.length < MAX_ACTIVE) {
    const moment: DecisionMoment = { ...candidate, id: buildId(ctx.rng) };
    return { ...ctx, pendingDecisions: [...current, moment] };
  }

  // Cap reached — drop lowest-priority if new moment is higher priority
  const lowestIdx = current.reduce((worst, m, i) =>
    priority(m.kind) > priority(current[worst]!.kind) ? i : worst, 0);

  if (priority(candidate.kind) >= priority(current[lowestIdx]!.kind)) {
    return ctx; // new moment is same or lower priority than the worst active — suppress
  }

  const moment: DecisionMoment = { ...candidate, id: buildId(ctx.rng) };
  const replaced = [...current];
  replaced.splice(lowestIdx, 1, moment);
  return { ...ctx, pendingDecisions: replaced };
}

const FATE_OPTION = {
  label: 'Let fate decide',
  description: 'Take no action. DI refund may apply if outcome is unfavourable.',
  diCost: 0,
  probabilityShift: 0,
  narrativeDistanceLabel: 'LOW' as const,
};

function detectConditions(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick;
  let next = ctx;

  // QUEST_DROUGHT: world event fired this tick
  const hasDrought = ctx.eventLog.some(e => e.kind === 'WORLD' && e.subtype === 'QUEST_DROUGHT' && e.tick === tick);
  const alreadyHasDrought = ctx.pendingDecisions.some(m => m.kind === 'OTHER');
  if (hasDrought && !alreadyHasDrought) {
    next = addMoment(next, {
      kind: 'OTHER',
      tick,
      situationText: 'The quest board stands empty — no work to be found.',
      options: [FATE_OPTION],
      expiresAt: tick + EXPIRY_WINDOW.OTHER,
    });
  }

  // RELATIONSHIP_COLLAPSE: BOND_BROKEN or RIVALRY_DEEPENED fired this tick
  const hasCollapse = ctx.eventLog.some(
    e => e.kind === 'LIFECYCLE' && (e.subtype === 'BOND_BROKEN' || e.subtype === 'RIVALRY_DEEPENED') && e.tick === tick,
  );
  const alreadyHasCollapse = ctx.pendingDecisions.some(m => m.kind === 'RELATIONSHIP_COLLAPSE');
  if (hasCollapse && !alreadyHasCollapse) {
    next = addMoment(next, {
      kind: 'RELATIONSHIP_COLLAPSE',
      tick,
      situationText: 'A bond between guild members is fracturing.',
      options: [FATE_OPTION],
      expiresAt: tick + EXPIRY_WINDOW.RELATIONSHIP_COLLAPSE,
    });
  }

  // DEATH_IMMINENT: active quest resolving within 12 ticks with low success probability
  const DEATH_IMMINENT_WINDOW = EXPIRY_WINDOW.DEATH_IMMINENT;
  for (const quest of next.questBoard.active) {
    if (quest.startedAt === undefined) continue;
    const ticksUntilResolution = quest.startedAt + quest.duration - tick;
    if (ticksUntilResolution <= 0 || ticksUntilResolution > DEATH_IMMINENT_WINDOW) continue;

    const party = (quest.assignedParty ?? [])
      .map(id => next.adventurers.get(id))
      .filter((a): a is Adventurer => a !== undefined);
    if (party.length === 0) continue;

    const prob = computeQuestProbability(quest, party, next.relationships, 0);
    if (prob >= 0.40) continue;

    const alreadyHasDeath = next.pendingDecisions.some(
      m => m.kind === 'DEATH_IMMINENT' && party.some(a => a.id === m.subjectId),
    );
    if (alreadyHasDeath) continue;

    // Build probability-shift options
    const targets = [0.50, 0.80, 0.95];
    const shiftOptions = targets.map(target => {
      const shift = Math.max(0, Math.min(0.95, target) - prob);
      const dist = narrativeDistance(prob, target);
      const diCost = Math.max(1, Math.round(dist * 10));
      const label =
        target === 0.50 ? 'Favour survival' :
        target === 0.80 ? 'Grant fortune' :
        'Divine protection';
      const distLabel: 'LOW' | 'MODERATE' | 'EXTREME' =
        dist < 1.5 ? 'LOW' : dist <= 4 ? 'MODERATE' : 'EXTREME';
      return { label, description: `Shift survival odds toward ${Math.round(target * 100)}%.`, diCost, probabilityShift: shift, narrativeDistanceLabel: distLabel };
    });

    const subjectId = party[0]!.id;
    const partyNames = party.map(a => a.identity.name).join(' & ');
    next = addMoment(next, {
      kind: 'DEATH_IMMINENT',
      tick,
      subjectId,
      situationText: `${partyNames} face long odds in the dungeon. ${quest.name} may end in tragedy.`,
      options: [FATE_OPTION, ...shiftOptions],
      expiresAt: tick + DEATH_IMMINENT_WINDOW,
    });
  }

  // SCENARIO_CRITICAL: a fail condition is within 3 days (72 ticks) of triggering
  if (next.scenario && next.scenario.status === 'ACTIVE') {
    const { treasuryNegativeSince } = next.scenario;
    const BANKRUPTCY_THRESHOLD = 168;
    const CRITICAL_LEAD_TIME = 72; // 3 days warning

    if (
      treasuryNegativeSince !== null &&
      tick - treasuryNegativeSince >= BANKRUPTCY_THRESHOLD - CRITICAL_LEAD_TIME &&
      !next.pendingDecisions.some(m => m.kind === 'SCENARIO_CRITICAL' && m.subjectId === 'BANKRUPTCY')
    ) {
      const daysElapsed = Math.floor((tick - treasuryNegativeSince) / 24);
      next = addMoment(next, {
        kind: 'SCENARIO_CRITICAL',
        tick,
        subjectId: 'BANKRUPTCY',
        situationText: `The guild treasury has been empty for ${daysElapsed} days. Bankruptcy looms.`,
        options: [
          FATE_OPTION,
          {
            label: 'Seed a windfall',
            description: 'Petition the divine for a merchant windfall in the region.',
            diCost: 15,
            probabilityShift: 0,
            narrativeDistanceLabel: 'MODERATE' as const,
          },
        ],
        expiresAt: tick + EXPIRY_WINDOW.SCENARIO_CRITICAL,
      });
    }

  }

  // PARTY_SELECTION: an available quest has unusually low probability for the best idle party
  const PARTY_SELECTION_THRESHOLD = 0.30;
  const idleAdventurers = [...next.adventurers.values()].filter(a => a.state === 'IDLE');
  for (const quest of next.questBoard.available) {
    if (quest.status !== 'AVAILABLE') continue;
    if (quest.requiredPartySize > idleAdventurers.length) continue;

    const ranked = idleAdventurers
      .map(a => ({ adv: a, weight: a.personality.courage + a.personality.ambition }))
      .sort((a, b) => b.weight - a.weight);
    const party = ranked.slice(0, quest.requiredPartySize).map(x => x.adv);
    if (party.length < quest.requiredPartySize) continue;

    const prob = computeQuestProbability(quest, party, next.relationships, 0);
    if (prob >= PARTY_SELECTION_THRESHOLD) continue;

    const cooldownKey = `PARTY_SELECTION:${quest.id}`;

    // Skip if on cooldown (player already saw and dismissed this quest's warning)
    if ((next.decisionCooldowns.get(cooldownKey) ?? 0) > tick) continue;

    // Skip if already pending
    if (next.pendingDecisions.some(m => m.kind === 'PARTY_SELECTION' && m.cooldownKey === cooldownKey)) continue;

    // subjectId = comma-joined adventurer IDs so chooseOption can fan out the shift
    const partySubjectId = party.map(a => a.id).join(',');
    next = addMoment(next, {
      kind: 'PARTY_SELECTION',
      tick,
      subjectId: partySubjectId,
      cooldownKey,
      situationText: `${quest.name} has a ${Math.round(prob * 100)}% chance of success with the current roster.`,
      options: [
        FATE_OPTION,
        {
          label: 'Bless the party',
          description: 'A divine blessing improves their odds.',
          diCost: 12,
          probabilityShift: 0.20,
          narrativeDistanceLabel: 'MODERATE' as const,
        },
      ],
      expiresAt: tick + EXPIRY_WINDOW.PARTY_SELECTION,
    });
  }

  // SCENARIO_GOAL: a scenario goal is one step away from completion
  if (next.scenario && next.scenario.status === 'ACTIVE') {
    const scenarioDef = getScenario(next.scenario.scenarioId);
    if (scenarioDef) {
      for (const goalState of next.scenario.goals) {
        if (goalState.completed) continue;
        const goalDef = scenarioDef.goals.find(g => g.id === goalState.id);
        if (!goalDef?.isImminent?.(next)) continue;
        if (next.pendingDecisions.some(m => m.kind === 'SCENARIO_GOAL' && m.subjectId === goalState.id)) continue;
        next = addMoment(next, {
          kind: 'SCENARIO_GOAL',
          tick,
          subjectId: goalState.id,
          situationText: `The guild is close to: ${goalState.description}`,
          options: [
            FATE_OPTION,
            {
              label: 'Grant favour',
              description: 'Acknowledge this moment. A DI bonus awaits if the goal completes.',
              diCost: 5,
              probabilityShift: 0,
              narrativeDistanceLabel: 'LOW' as const,
            },
          ],
          expiresAt: tick + EXPIRY_WINDOW.SCENARIO_GOAL,
        });
      }
    }
  }

  // DEPARTURE: adventurer with despairStreak >= 3 in departure-eligible state
  const DEPARTURE_ELIGIBLE_STATES = new Set(['IDLE', 'RESTING', 'SOCIALIZING'] as const);
  for (const adv of next.adventurers.values()) {
    if (!DEPARTURE_ELIGIBLE_STATES.has(adv.state as 'IDLE' | 'RESTING' | 'SOCIALIZING')) continue;
    if (computeDepartureProbability(adv) <= 0) continue;
    const alreadyHasDeparture = next.pendingDecisions.some(
      m => m.kind === 'DEPARTURE' && m.subjectId === adv.id,
    );
    if (alreadyHasDeparture) continue;
    next = addMoment(next, {
      kind: 'DEPARTURE',
      tick,
      subjectId: adv.id,
      situationText: `${adv.identity.name} has gone ${adv.despairStreak} days without hope. They may leave the guild.`,
      options: [
        FATE_OPTION,
        {
          label: 'Lift their spirits',
          description: 'A divine touch lifts their mood and reduces the chance they leave.',
          diCost: 8,
          probabilityShift: 0.30,
          narrativeDistanceLabel: 'MODERATE' as const,
        },
      ],
      expiresAt: tick + EXPIRY_WINDOW.DEPARTURE,
    });
  }

  return next;
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

export function decisionMomentSubscriber(ctx: SimulationContext, _delta: number): SimulationContext {
  let next = handleExpiry(ctx);
  next = detectConditions(next);
  return next;
}
