import type { SimulationContext, DecisionMoment, DecisionMomentKind } from '../world/types.js';
import { emitEvent } from './eventBus.js';
import { grantDI } from '../divine/DivineInfluence.js';

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

function handleExpiry(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick;
  const expired = ctx.pendingDecisions.filter(m => tick >= m.expiresAt);
  if (expired.length === 0) return ctx;

  let next: SimulationContext = {
    ...ctx,
    pendingDecisions: ctx.pendingDecisions.filter(m => tick < m.expiresAt),
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
