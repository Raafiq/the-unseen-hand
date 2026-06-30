/**
 * Client-side narrator — calls Claude API to produce a day-summary paragraph.
 * Returns null if no API key is set, if the call errors, or if it times out.
 * Never throws; never blocks the simulation tick loop.
 *
 * Spec: specs/behaviors/llm-narrator.md
 */
import { getDayEvents, buildNarratorPrompt } from '@ugs/core';
import type { SimulationContext } from '@ugs/core';

const TIMEOUT_MS = 10_000;
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;

export async function fetchDaySummary(
  day: number,
  ctx: SimulationContext,
): Promise<string | null> {
  const apiKey = ((import.meta as any).env?.VITE_CLAUDE_API_KEY as string | undefined)
    || (typeof window !== 'undefined' ? (window as any).__e2eNarratorKey as string | undefined : undefined);
  if (!apiKey) return null;

  const events = getDayEvents(ctx.eventLog, day);
  const { systemPrompt, userPrompt } = buildNarratorPrompt(day, events, ctx);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn('[narrator] API error', res.status);
      return null;
    }

    const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find(c => c.type === 'text')?.text?.trim();
    return text ?? null;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[narrator] fetch error:', err);
    }
    return null;
  }
}
