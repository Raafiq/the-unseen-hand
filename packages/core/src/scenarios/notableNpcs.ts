/**
 * Starting-town notable (Tier A) NPCs.
 *
 * Spec: specs/behaviors/npc-system.md#tier-a--notable-npcs
 * A handful of named, persistent townsfolk who live in the relationship graph as
 * honorary actors. Seeded at world generation; no edges until an adventurer interacts.
 * Interiority (mood, history, want) is earned and event-driven — see
 * npc-system.md#interiority-earned-event-driven. The BASELINE factor keeps a
 * factor-derived mood at the 50 midpoint until town life moves it.
 */
import type { MoodFactor, NotableNpc, NpcId } from '../world/types.js';
import { makeNpcId } from '../world/actors.js';

const npcBaseline = (label: string): MoodFactor[] => [
  { id: 'BASELINE', label, value: 50, decayRate: 0 },
];

/** The starting town (Thornvale) notable NPCs. */
export const THORNVALE_NPCS: NotableNpc[] = [
  {
    id: makeNpcId('brenna-smith'),
    name: 'Brenna',
    role: 'BLACKSMITH',
    traits: { courage: 60, loyalty: 70, empathy: 55, stubborn: 65 },
    bio: 'The town blacksmith. Gruff, dependable, and quietly proud of every blade she turns out.',
    mood: 50,
    moodFactors: npcBaseline('Steady trade'),
    history: [],
    want: { id: 'WANT_CRAFT_HONOURED', text: 'to see her blades come home carried, not sold' },
  },
  {
    id: makeNpcId('halden-captain'),
    name: 'Captain Halden',
    role: 'GUARD_CAPTAIN',
    traits: { courage: 75, loyalty: 80, empathy: 40, ambition: 55 },
    bio: 'Captain of the town watch. Rigid about the rules, but he has never once left a wall undefended.',
    mood: 50,
    moodFactors: npcBaseline('The watch holds'),
    history: [],
    want: { id: 'WANT_QUIET_WATCH', text: 'one full season where the walls are never tested' },
  },
  {
    id: makeNpcId('marsa-inn'),
    name: 'Marsa',
    role: 'INNKEEPER',
    traits: { empathy: 75, loyalty: 60, greed: 45, courage: 35 },
    bio: 'Keeps the Broken Wheel inn. Hears every rumour in town and remembers who paid their tab.',
    mood: 50,
    moodFactors: npcBaseline('A full common room'),
    history: [],
    want: { id: 'WANT_FULL_TABLES', text: 'to see the common room loud and every bed spoken for' },
  },
  {
    id: makeNpcId('father-oswin'),
    name: 'Father Oswin',
    role: 'PRIEST',
    traits: { empathy: 80, loyalty: 65, courage: 30, greed: 15 },
    bio: 'The town priest. Gentle to a fault, and slower to judge than anyone the guild has met.',
    mood: 50,
    moodFactors: npcBaseline('The small congregation'),
    history: [],
    want: { id: 'WANT_NO_MORE_GRAVES', text: 'to go one year without digging a young grave' },
  },
];

/** Build the starting-town notable-NPC map. */
export function createThornvaleNpcs(): Map<NpcId, NotableNpc> {
  return new Map(THORNVALE_NPCS.map(npc => [npc.id, npc]));
}
