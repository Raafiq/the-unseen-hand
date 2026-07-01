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

### UI verification — no manual browser gates

All UI validation must be automated. Do not leave a plan validation step that requires
a human to open a browser. Use Playwright (`apps/game-client/tests/`) targeting
`vite preview` (built output) as the `webServer`. Add a `test:e2e` script to the
package. Replace any "verify in browser" checklist item with a concrete Playwright
assertion before calling a plan done.

### Store rule — auto-pause must save and restore speed

When `simulationStore` auto-pauses the loop for a game-state condition (e.g. a new
decision moment appears), it must:
1. Save `simulationStore.speedBeforePause` before calling `setSpeed('paused')`
2. Call `setSpeed(simulationStore.speedBeforePause)` when the condition clears

Failing to restore speed leaves the loop permanently paused after the player acts.
