import type { SimulationContext, SimulationEvent } from '../world/types.js';

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
