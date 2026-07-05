/**
 * Client-side narrator — the low-level Claude client for the LLM set-pieces.
 * Every call returns null if no API key is set, if the call errors, or if it times out;
 * it never throws and never blocks the turn. The per-cycle overview + chapter set-pieces
 * (cycleNarrator.ts) are the only callers.
 *
 * Spec: specs/behaviors/llm-narrator.md, specs/behaviors/cycle-narrative.md (LLM tier)
 */
import type { NarratorPrompt } from '@ugs/core';

const TIMEOUT_MS = 10_000;
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;

/**
 * Resolve the Claude API key: the Vite build-time env var, or an e2e-injected window key
 * (import.meta.env.VITE_CLAUDE_API_KEY is undefined in the built output, so the window
 * fallback is what the narrator e2e mocks against).
 */
export function resolveNarratorApiKey(): string | undefined {
  return ((import.meta as any).env?.VITE_CLAUDE_API_KEY as string | undefined)
    || (typeof window !== 'undefined' ? (window as any).__e2eNarratorKey as string | undefined : undefined);
}

/**
 * Fire one narrator set-piece prompt at the Claude API. Returns the prose on success, or null
 * on API error / >10s timeout / malformed response — degraded mode is silent, the caller keeps
 * its template passage. Never throws.
 */
export async function callNarrator(
  prompt: NarratorPrompt,
  apiKey: string,
  maxTokens: number = MAX_TOKENS,
): Promise<string | null> {
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
        max_tokens: maxTokens,
        system: prompt.systemPrompt,
        messages: [{ role: 'user', content: prompt.userPrompt }],
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
    if ((err as Error).name !== 'AbortError' && (err as Error).name !== 'TimeoutError') {
      console.warn('[narrator] fetch error:', err);
    }
    return null;
  }
}
