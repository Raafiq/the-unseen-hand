import type { Adventurer, ActorId, Cycle, RelationshipEdge, SimulationContext, SimulationEvent } from '../world/types.js';
import { moodThresholdLabel } from '../adventurers/mood.js';

/** Returns all events from a given in-game day (ticks day*24 through day*24+23). */
export function getDayEvents(eventLog: SimulationEvent[], day: number): SimulationEvent[] {
  const start = day * 24;
  const end = start + 24;
  return eventLog.filter(e => e.tick >= start && e.tick < end);
}

export type NarratorPrompt = {
  systemPrompt: string;
  userPrompt: string;
};

// The established narrator voice (llm-narrator.md §"Prompt structure"), shared by the
// day summary and the per-cycle set-pieces so every LLM passage speaks in one voice.
const NARRATOR_VOICE =
  'You are the voice of fate watching over a guild of adventurers. ' +
  'You write short, evocative prose — capturing the emotional truth of what happened, not just ' +
  'listing facts. No direct speech, no headers, no bullet points. ' +
  'Tone: melancholy, watchful, occasionally darkly wry. You are the narrator. ' +
  'Return only the prose paragraph.';

const CYCLE_WORD: Record<Cycle, string> = { MORNING: 'morning', AFTERNOON: 'afternoon', NIGHT: 'night' };

/** `- [KIND] rendered text` lines, or `(no events)` when empty (shared with the day prompt). */
function eventLines(events: SimulationEvent[]): string {
  return events.map(e => `- [${e.kind}] ${e.renderedText}`).join('\n') || '(no events)';
}

/** Builds the Claude API prompt for a day summary. Pure — no I/O. */
export function buildNarratorPrompt(
  day: number,
  events: SimulationEvent[],
  ctx: SimulationContext,
): NarratorPrompt {
  const systemPrompt =
    'You are the voice of fate watching over a guild of adventurers. ' +
    'You write short, evocative prose summaries of a day\'s events — capturing the emotional truth ' +
    'of what happened, not just listing facts. Two to three sentences. No direct speech. ' +
    'Present tense. Tone: melancholy, watchful, occasionally darkly wry. ' +
    'You are the narrator. Return only the prose paragraph, no headers or bullet points.';

  const eventLines = events.map(e => `- [${e.kind}] ${e.renderedText}`).join('\n') || '(no events)';

  const adventurerLines = [...ctx.adventurers.values()]
    .filter(a => a.state !== 'DEAD' && a.state !== 'RETIRED')
    .map(a => `${a.identity.name} (${a.state}, mood ${a.mood})`)
    .join(', ');

  const userPrompt =
    `Day ${day} in-game.\n\n` +
    `Events:\n${eventLines}\n\n` +
    `Active roster: ${adventurerLines || '(none)'}`;

  return { systemPrompt, userPrompt };
}

// ---------------------------------------------------------------------------
// Per-cycle set-pieces (cycle redesign, 2026-07-04): the day summary generalises
// to a per-cycle overview plus one chapter per eventful character. These builders
// are pure — the client selects the events and fires the batched Claude calls.
// (llm-narrator.md, cycle-narrative.md §"LLM tier", narrative-voice.md set-piece 1.)
// ---------------------------------------------------------------------------

/**
 * The cycle overview prompt — a 1-2 sentence establishing paragraph for the whole guild that
 * cycle. The direct descendant of the day summary, now fired per cycle.
 */
export function buildCycleOverviewPrompt(
  day: number,
  cycle: Cycle,
  events: SimulationEvent[],
  ctx: SimulationContext,
): NarratorPrompt {
  const systemPrompt =
    NARRATOR_VOICE +
    ' Write one or two sentences establishing the shape of this cycle for the whole guild — the ' +
    'weather, the mood of the hall, the tenor of the hours. Frame; do not recount every event.';

  const adventurerLines = [...ctx.adventurers.values()]
    .filter(a => a.state !== 'DEAD' && a.state !== 'RETIRED')
    .map(a => `${a.identity.name} (${a.state}, mood ${a.mood})`)
    .join(', ');

  const userPrompt =
    `The ${CYCLE_WORD[cycle]} of Day ${day}.\n\n` +
    `Events this cycle:\n${eventLines(events)}\n\n` +
    `Active roster: ${adventurerLines || '(none)'}`;

  return { systemPrompt, userPrompt };
}

/** Compact personality axes line, e.g. "courage 72, greed 18, empathy 65, loyalty 80, ambition 40". */
function describeAxes(a: Adventurer): string {
  const { courage, greed, empathy, loyalty, ambition, stubborn } = a.personality;
  const parts = [`courage ${courage}`, `greed ${greed}`, `empathy ${empathy}`, `loyalty ${loyalty}`, `ambition ${ambition}`];
  if (stubborn !== undefined) parts.push(`stubborn ${stubborn}`);
  return parts.join(', ');
}

/** The character's strongest relationships, e.g. "Mira (FRIEND), Halden (RIVAL)" — up to `n`. */
function keyRelationships(ctx: SimulationContext, actorId: ActorId, n = 3): string {
  const edges = ctx.relationships.get(actorId);
  if (!edges) return '(none)';
  const named = [...edges.entries()]
    .map(([otherId, edge]): { name: string; edge: RelationshipEdge } | undefined => {
      const name = ctx.adventurers.get(otherId)?.identity.name ?? ctx.notableNpcs.get(otherId)?.name;
      return name ? { name, edge } : undefined;
    })
    .filter((x): x is { name: string; edge: RelationshipEdge } => x !== undefined)
    .sort((a, b) => Math.abs(b.edge.strength) - Math.abs(a.edge.strength))
    .slice(0, n)
    .map(x => `${x.name} (${x.edge.type})`);
  return named.length > 0 ? named.join(', ') : '(none)';
}

/**
 * The per-character chapter prompt — asks for this one character's story of the cycle. Carries
 * their cycle events plus the character context (personality axes, mood, key relationships) that
 * lets the narrator colour the passage without inventing facts.
 */
export function buildCycleChapterPrompt(
  actor: Adventurer,
  day: number,
  cycle: Cycle,
  events: SimulationEvent[],
  ctx: SimulationContext,
): NarratorPrompt {
  const systemPrompt =
    NARRATOR_VOICE +
    ' Write two to four sentences telling this one character\'s story of the cycle, from close to ' +
    'them. Present tense or intimate past. Invent no facts beyond the events given; let their ' +
    'personality and mood shade the telling.';

  const band = moodThresholdLabel(actor.mood);
  const userPrompt =
    `${actor.identity.name}'s ${CYCLE_WORD[cycle]}, Day ${day}.\n\n` +
    `Personality: ${describeAxes(actor)}.\n` +
    `Mood: ${actor.mood} (${band}).\n` +
    `Key relationships: ${keyRelationships(ctx, actor.id)}.\n\n` +
    `What happened to them this cycle:\n${eventLines(events)}`;

  return { systemPrompt, userPrompt };
}
