import type {
  SimulationContext,
  AdventurerId,
  RegionId,
  WorldEventType,
  HistoryEvent,
} from '../world/types.js';
import { emitEvent } from '../events/eventBus.js';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type DispatchOk = { ok: true; ctx: SimulationContext };
export type DispatchError = { ok: false; error: string };
export type DispatchResult = DispatchOk | DispatchError;

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

type DivineEffect = 'COURAGE_BLESS' | 'LUCK_CURSE' | 'MOOD_LIFT' | 'SEND_DREAM' | 'REVEAL_SECRET' | 'MARK_FOR_DEATH';

export type DispatchCommand =
  | { type: 'CHOOSE_OPTION'; decisionId: string; optionIndex: number }
  | { type: 'DIVINE_TOUCH'; adventurerId: AdventurerId; effect: DivineEffect; diCost: number }
  | { type: 'SEED_EVENT'; regionId: RegionId; eventType: WorldEventType; diCost: number }
  | { type: 'SHIFT_DIFFICULTY'; regionId: RegionId; delta: number; diCost: number };

// ---------------------------------------------------------------------------
// CHOOSE_OPTION
// ---------------------------------------------------------------------------

const WORLD_EVENT_DURATION: Partial<Record<WorldEventType, number>> = {
  STORM: 72,
  PLAGUE: 168,
  WINDFALL: 72,
  MONSTER_SURGE: 168,
  TRAVELLING_MERCHANT: 24,
  RUMOUR: 72,
};

function chooseOption(ctx: SimulationContext, cmd: Extract<DispatchCommand, { type: 'CHOOSE_OPTION' }>): DispatchResult {
  const moment = ctx.pendingDecisions.find(m => m.id === cmd.decisionId);
  if (!moment) return { ok: false, error: 'DECISION_NOT_FOUND' };

  const option = moment.options[cmd.optionIndex];
  if (!option) return { ok: false, error: 'DECISION_NOT_FOUND' };

  if (ctx.divineInfluence < option.diCost) return { ok: false, error: 'INSUFFICIENT_DI' };

  let next: SimulationContext = {
    ...ctx,
    divineInfluence: ctx.divineInfluence - option.diCost,
    pendingDecisions: ctx.pendingDecisions.filter(m => m.id !== cmd.decisionId),
  };
  next = emitEvent(next, { kind: 'DIVINE', subtype: 'OPTION_CHOSEN', diDelta: -option.diCost });

  return { ok: true, ctx: next };
}

// ---------------------------------------------------------------------------
// DIVINE_TOUCH
// ---------------------------------------------------------------------------

const COOLDOWN_EFFECTS = new Set<DivineEffect>(['LUCK_CURSE', 'MARK_FOR_DEATH']);
const COOLDOWN_TICKS = 168; // 7 days

function divineTouch(ctx: SimulationContext, cmd: Extract<DispatchCommand, { type: 'DIVINE_TOUCH' }>): DispatchResult {
  const adv = ctx.adventurers.get(cmd.adventurerId);
  if (!adv) return { ok: false, error: 'INVALID_TARGET' };
  if (adv.state === 'DEAD' || adv.state === 'RETIRED') return { ok: false, error: 'INVALID_TARGET' };

  if (ctx.divineInfluence < cmd.diCost) return { ok: false, error: 'INSUFFICIENT_DI' };

  // Cooldown check
  if (COOLDOWN_EFFECTS.has(cmd.effect)) {
    const kindToCheck = cmd.effect as 'LUCK_CURSE' | 'MARK_FOR_DEATH';
    const recent = adv.history.find(
      h => h.kind === kindToCheck && ctx.worldTime.tick - h.tick < COOLDOWN_TICKS,
    );
    if (recent) return { ok: false, error: 'COOLDOWN_ACTIVE' };
  }

  let next: SimulationContext = { ...ctx, divineInfluence: ctx.divineInfluence - cmd.diCost };

  // Apply effect
  if (cmd.effect === 'MOOD_LIFT') {
    const updatedAdv = {
      ...adv,
      moodFactors: [...adv.moodFactors, { id: 'divine_touch', label: 'Divine Touch', value: 25, decayRate: 0.20 }],
    };
    next = { ...next, adventurers: new Map(next.adventurers).set(adv.id, updatedAdv) };
  } else if (cmd.effect === 'LUCK_CURSE' || cmd.effect === 'MARK_FOR_DEATH') {
    const historyEntry: HistoryEvent = { kind: cmd.effect, tick: ctx.worldTime.tick, involvedIds: [], weight: 0 };
    const updatedAdv = { ...adv, history: [...adv.history, historyEntry] };
    next = { ...next, adventurers: new Map(next.adventurers).set(adv.id, updatedAdv) };
  }

  next = emitEvent(next, { kind: 'DIVINE', subtype: 'TOUCH', diDelta: -cmd.diCost, targetId: cmd.adventurerId });

  return { ok: true, ctx: next };
}

// ---------------------------------------------------------------------------
// SEED_EVENT
// ---------------------------------------------------------------------------

function seedEvent(ctx: SimulationContext, cmd: Extract<DispatchCommand, { type: 'SEED_EVENT' }>): DispatchResult {
  const region = ctx.activeRegions.get(cmd.regionId);
  if (!region) return { ok: false, error: 'REGION_NOT_FOUND' };

  if (ctx.divineInfluence < cmd.diCost) return { ok: false, error: 'INSUFFICIENT_DI' };

  const alreadyActive = region.activeWorldEvents.some(e => e.type === cmd.eventType);
  if (alreadyActive) return { ok: false, error: 'EVENT_ALREADY_ACTIVE' };

  const duration = WORLD_EVENT_DURATION[cmd.eventType] ?? 72;
  const updatedRegion = {
    ...region,
    activeWorldEvents: [
      ...region.activeWorldEvents,
      { type: cmd.eventType, startedAt: ctx.worldTime.tick, expiresAt: ctx.worldTime.tick + duration },
    ],
  };

  let next: SimulationContext = {
    ...ctx,
    divineInfluence: ctx.divineInfluence - cmd.diCost,
    activeRegions: new Map(ctx.activeRegions).set(cmd.regionId, updatedRegion),
  };
  next = emitEvent(next, { kind: 'DIVINE', subtype: 'SEED_EVENT', diDelta: -cmd.diCost });

  return { ok: true, ctx: next };
}

// ---------------------------------------------------------------------------
// SHIFT_DIFFICULTY
// ---------------------------------------------------------------------------

function shiftDifficulty(ctx: SimulationContext, cmd: Extract<DispatchCommand, { type: 'SHIFT_DIFFICULTY' }>): DispatchResult {
  const region = ctx.activeRegions.get(cmd.regionId);
  if (!region) return { ok: false, error: 'REGION_NOT_FOUND' };

  if (ctx.divineInfluence < cmd.diCost) return { ok: false, error: 'INSUFFICIENT_DI' };

  const newDifficulty = Math.min(10, Math.max(1, region.difficulty + cmd.delta));
  const updatedRegion = { ...region, difficulty: newDifficulty };

  let next: SimulationContext = {
    ...ctx,
    divineInfluence: ctx.divineInfluence - cmd.diCost,
    activeRegions: new Map(ctx.activeRegions).set(cmd.regionId, updatedRegion),
  };
  next = emitEvent(next, { kind: 'DIVINE', subtype: 'SHIFT_DIFFICULTY', diDelta: -cmd.diCost });

  return { ok: true, ctx: next };
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

export function dispatch(ctx: SimulationContext, command: DispatchCommand): DispatchResult {
  switch (command.type) {
    case 'CHOOSE_OPTION':    return chooseOption(ctx, command);
    case 'DIVINE_TOUCH':     return divineTouch(ctx, command);
    case 'SEED_EVENT':       return seedEvent(ctx, command);
    case 'SHIFT_DIFFICULTY': return shiftDifficulty(ctx, command);
  }
}
