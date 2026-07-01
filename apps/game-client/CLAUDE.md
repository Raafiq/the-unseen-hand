# @ugs/game-client — UI guardrails

Svelte 5 + Pixi.js UI over `@ugs/core`. E2E in `tests/`. These rules apply to work
under `apps/game-client`; see the root `CLAUDE.md` for commands, architecture, and
the specops workflow.

### TypeScript / Svelte verification

**Before any Svelte edit is considered verified:**
- `tsc --noEmit` must pass with zero errors.
- `svelte-check` must pass with zero errors.

Both must pass. A green `tsc` alone is insufficient.

```powershell
pnpm --filter @ugs/game-client check   # svelte-check (guardrail)
```

### Svelte 5 store rule

```typescript
// ✅ Correct — object export with $state inside
export const simulationStore = $state({ adventurerMap: new Map(), divineInfluence: 50 });

// ❌ Wrong — triggers state_invalid_export
export let divineInfluence = $state(50);
```

Always use `export const store = $state({...})`. Never `export let x = $state(...)`.

### Svelte project setup — svelte.config.js is required

Any Svelte app in this monorepo needs **both** `vite.config.ts` and `svelte.config.js`.
`svelte-check` resolves the preprocessor from `svelte.config.js`, not from the Vite
plugin — without it, `svelte-check` fails with "No Svelte configuration found."

```javascript
// svelte.config.js — must exist alongside vite.config.ts
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

### UI display rule — enum labels use typed Records, not string replace

When an enum value needs a human-readable label in the UI, define a
`Record<EnumType, string>` lookup. Never use `.replace(/_/g, ' ')` as a
fallback — it silently handles unknown values and hides gaps that TypeScript
would otherwise catch at compile time.

```typescript
// ✅ Correct — TypeScript enforces all WorldEventType values are present
const EVENT_LABELS: Record<WorldEventType, string> = {
  STORM: 'Storm', MONSTER_SURGE: 'Monster Surge', TRAVELLING_MERCHANT: 'Travelling Merchant', ...
};

// ❌ Wrong — replace fallback masks missing cases
return EVENT_OPTIONS.find(o => o.type === type)?.label ?? type.replace(/_/g, ' ');
```

Also: a `never`-typed default branch in an exhaustive switch means the switch
already covers all cases — applying `.replace()` there causes a TS error and
indicates no fix is needed.

**EventFeed.svelte requires three updates per new EventKind:** `KIND_LABELS`
(the exhaustive `Record<EventKind, ...>`), `ALL_KINDS` (the array used for
filter rendering), and `getInvolvedIds` (which must handle any participant
fields the new event type carries — `participantIds`, `involvedIds`, `partyIds`,
`adventurerId`, etc.). `tsc` catches a missing `KIND_LABELS` entry but does NOT
catch missing `ALL_KINDS` or `getInvolvedIds` entries — the kind simply won't
appear in the feed or character filter.

### Hiding or filtering a content category spans multiple surfaces

Event kinds and history entries render in several places, and the core engine
keeps emitting them regardless of UI state — so hiding a "feature" is a
client-side display concern that is NOT done by hiding its nav tab/panel alone.
Cover every surface or the content leaks:

- **EventFeed** — the rendered rows *and* the filter chips (`ALL_KINDS`).
- **Unread badge** — `unreadEventCount` in `simulationStore`, else the badge
  counts events the feed won't show.
- **LLM narrator** — the day-summary prompt is built from the event log
  (`fetchDaySummary`), so it recaps hidden kinds unless you filter its input.
- **CharacterDetail history** — `recentHistory` renders `HistoryEvent`s.

`featureFlags.ts` (`hiddenEventKinds` / `hiddenHistoryKinds`) is the single
source all four read from. Gotcha: **COMBAT is quest-derived** — both subtypes
are emitted only by `questSystem.ts` (required `questId`), so it belongs to the
quests feature, not a category of its own.

### UI verification — no manual browser gates

All UI validation must be automated. Do not leave a plan validation step that requires
a human to open a browser. Use Playwright (`apps/game-client/tests/`) targeting
`vite preview` (built output) as the `webServer`. Add a `test:e2e` script to the
package. Replace any "verify in browser" checklist item with a concrete Playwright
assertion before calling a plan done.

**Pixel/screenshot checks:** Playwright's `webServer` owns port 4173 (`vite preview`),
so a hand-started preview makes `test:e2e` fail with "4173 is already used" — free it
first (`Get-NetTCPConnection -LocalPort 4173 | Stop-Process`; `taskkill` by window title
won't find it). Cleanest path: capture the screenshot from a throwaway Playwright spec run
through the harness, which owns the server itself and avoids both the port clash and the
`@playwright/test` module-resolution gotcha (a standalone `.mjs` only resolves that import
from inside `apps/game-client/`).

### Store rule — auto-pause must save and restore speed

When `simulationStore` auto-pauses the loop for a game-state condition (e.g. a new
decision moment appears), it must:
1. Save `simulationStore.speedBeforePause` before calling `setSpeed('paused')`
2. Call `setSpeed(simulationStore.speedBeforePause)` when the condition clears

Failing to restore speed leaves the loop permanently paused after the player acts.
