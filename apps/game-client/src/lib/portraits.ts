// Character portrait resolution (behaviors/character-portraits.md).
//
// Portraits are a pure view over identity: a character resolves to hand-authored art
// when it exists, otherwise to the deterministic colored-initial circle. Resolution
// never fails — a miss returns null and the caller renders the circle fallback.
//
// The manifest is built from the module graph at build time, so Vite rewrites every
// URL for the deploy base path (`/the-unseen-hand/` on Pages, `/` locally) and only
// files that actually exist enter the map — a missing portrait is a silent map-miss,
// never a 404.

import { isNpc, NPC_ID_PREFIX } from '@ugs/core';
import type { ActorId, TownRole } from '@ugs/core';

// key = "<folder>/<basename>" (e.g. "adventurers/s1-reiko", "npcs/brenna-smith",
// "roles/blacksmith"); value = the hashed, base-path-correct asset URL.
const manifest: Record<string, string> = {};
for (const [path, url] of Object.entries(
  import.meta.glob('./assets/portraits/**/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)) {
  const match = path.match(/\/portraits\/(.+)\.webp$/);
  if (match) manifest[match[1]] = url;
}

/**
 * Resolve a character to a portrait image URL, walking the fallback chain from
 * `behaviors/character-portraits.md`:
 *   1. exact character art by id (adventurer slug, or `npc:` slug → `npcs/<slug>`)
 *   2. generic art by `TownRole` (nameless townsfolk) — only when a role is supplied
 *   3. `null` → the caller renders the deterministic colored circle
 *
 * The colored circle is the terminal fallback, not the default: art always wins.
 */
export function portraitSrc(actorId: ActorId, opts?: { role?: TownRole }): string | null {
  if (isNpc(actorId)) {
    const slug = actorId.slice(NPC_ID_PREFIX.length);
    const art = manifest[`npcs/${slug}`];
    if (art) return art;
    if (opts?.role) {
      const roleArt = manifest[`roles/${opts.role.toLowerCase()}`];
      if (roleArt) return roleArt;
    }
    return null;
  }
  return manifest[`adventurers/${actorId}`] ?? null;
}

/**
 * The deterministic colored-initial circle — the terminal portrait fallback.
 * Hue is hashed from the character id so it is stable across renders. Consolidated
 * here from the five components that previously each carried a copy.
 */
export function portraitColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 50%, 40%)`;
}
