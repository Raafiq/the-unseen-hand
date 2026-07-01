/**
 * Tier B town flavour — nameless-role NPC lines.
 *
 * Spec: specs/behaviors/npc-system.md#tier-b--nameless-roles
 * During a town-eligible (non-Private) activity, at a low per-tick rng chance an adventurer
 * crosses paths with a nameless role and one grammar line is emitted. No pressure, no cooldown,
 * no relationship or mood effect — the event itself is the entire record. A live FESTIVAL raises
 * the frequency. All selection flows through ctx.rng (no Math.random).
 */
import type { SimulationContext, TownRole } from '../world/types.js';
import { emitEvent } from './eventBus.js';
import { isTownEligible } from './activitySystem.js';
import { hasActiveSpan } from '../world/WorldExpansion.js';

/** The nameless roles Tier B can surface. Doubles as the notable-NPC role labels. */
export const TOWN_ROLES: TownRole[] = [
  'GATE_GUARD', 'SHOPKEEPER', 'URCHIN', 'DRUNK', 'PRIEST', 'MERCHANT',
  'BEGGAR', 'BARD', 'STABLEHAND', 'BLACKSMITH', 'GUARD_CAPTAIN', 'INNKEEPER',
];

/** Base per-adventurer, per-tick chance of a Tier B flavour line during a town-eligible activity. */
export const TOWN_FLAVOUR_CHANCE = 0.02;

/** A live FESTIVAL multiplies Tier B frequency (npc-system.md). */
export const FESTIVAL_FLAVOUR_MULT = 2;

/** The effective Tier B chance for the current festival state. */
export function townFlavourChance(ctx: SimulationContext): number {
  const mult = hasActiveSpan(ctx, 'FESTIVAL') ? FESTIVAL_FLAVOUR_MULT : 1;
  return Math.min(1, TOWN_FLAVOUR_CHANCE * mult);
}

function isEligible(state: string): boolean {
  return state !== 'DEAD' && state !== 'RETIRED' && state !== 'ON_QUEST' && state !== 'IN_DUNGEON';
}

/**
 * Roll Tier B flavour for every eligible adventurer at the given per-tick chance. Exposed
 * (with an explicit chance) so tests can drive it deterministically; the subscriber calls it
 * with `townFlavourChance(ctx)`.
 */
export function rollTownFlavour(ctx: SimulationContext, chance: number): SimulationContext {
  if (ctx.adventurers.size === 0 || chance <= 0) return ctx;
  let next = ctx;
  for (const adv of ctx.adventurers.values()) {
    if (!isEligible(adv.state)) continue;
    const activity = adv.activityState?.current;
    if (!activity || !isTownEligible(activity)) continue; // non-town-eligible → no flavour
    if (next.rng.next() >= chance) continue;
    const role = TOWN_ROLES[Math.floor(next.rng.next() * TOWN_ROLES.length)]!;
    next = emitEvent(next, { kind: 'NPC', subtype: 'TOWN_FLAVOUR', adventurerId: adv.id, role });
  }
  return next;
}

/** Per-tick Tier B flavour subscriber. Register after the activity subscriber. */
export function npcFlavourSubscriber(ctx: SimulationContext): SimulationContext {
  return rollTownFlavour(ctx, townFlavourChance(ctx));
}
