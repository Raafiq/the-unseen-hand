/**
 * simulationStore — Svelte 5 reactive state bridging @ugs/core SimulationLoop.
 *
 * Svelte 5 store rule: always `export const store = $state({...})`, never `export let x = $state(...)`.
 */
import {
  SimulationLoop,
  createScenario1Context,
  dispatch,
  makeNpcId,
  createEdge,
  type DispatchCommand,
  type DecisionMoment,
  type SimulationContext,
} from '@ugs/core';
import { fetchDaySummary } from './narrator.js';
import { FEATURES, hiddenEventKinds } from './featureFlags.js';

// Import to trigger registration
import '@ugs/core';

// Create the initial context with Scenario 1
const initialCtx = createScenario1Context();

// E2E seam (test-only): the single-adventurer scenario produces no decision moments
// organically, so — gated behind an explicit `?e2e=decision` query param — inject one
// deterministic PARTY_SELECTION moment. This lets the choice-card spec exercise the real
// ChoiceCard render path without waiting on emergent board state. Never runs in normal play.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('e2e') === 'decision') {
  const e2eDecision: DecisionMoment = {
    id: 'e2e-decision',
    kind: 'PARTY_SELECTION',
    tick: initialCtx.worldTime.tick,
    situationText: 'A perilous bounty stands little chance with the current roster.',
    subjectId: 's1-reiko',
    cooldownKey: 'PARTY_SELECTION:e2e',
    options: [
      { label: 'Let fate decide', description: 'Do not intervene.', diCost: 0, probabilityShift: 0, narrativeDistanceLabel: 'LOW' },
      { label: 'Bless the party', description: 'A divine blessing improves their odds.', diCost: 12, probabilityShift: 0.2, narrativeDistanceLabel: 'MODERATE' },
    ],
    expiresAt: initialCtx.worldTime.tick + 100_000,
  };
  initialCtx.pendingDecisions = [e2eDecision];
}

// E2E seam (test-only): townsfolk↔adventurer edges form only after emergent town encounters,
// so — gated behind `?e2e=npc` — seed one deterministic FRIEND edge between Reiko and the guard
// captain (Halden). This lets the townsfolk-detail spec exercise the real relationship-row →
// NpcDetail path without waiting on emergent state. Never runs in normal play.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('e2e') === 'npc') {
  const advId = 's1-reiko';
  const haldenId = makeNpcId('halden-captain');
  const edge = createEdge(55); // FRIEND (≥ 40)
  const link = (a: string, b: string) => {
    const row = new Map(initialCtx.relationships.get(a) ?? new Map());
    row.set(b, edge);
    initialCtx.relationships.set(a, row);
  };
  link(advId, haldenId);
  link(haldenId, advId); // edges are symmetric (relationship-graph.md)
}

// Single SimulationLoop instance
export const loop = new SimulationLoop(initialCtx);

// ---------------------------------------------------------------------------
// Svelte 5 reactive store
// ---------------------------------------------------------------------------

export const simulationStore = $state({
  ctx: initialCtx as SimulationContext,
  speed: 1 as 1 | 5 | 20 | 'paused',
  speedBeforePause: 1 as 1 | 5 | 20, // speed to restore after decision pause
  selectedAdventurerId: null as string | null,
  activeTab: 'roster' as 'roster' | 'quests' | 'world' | 'events',
  eventsLastReadTick: -1, // tick when Events tab was last opened; drives unread badge
  daySummaries: new Map<number, string>(), // day → narrator prose; populated async
});

// Register a render observer at the end of the subscriber chain.
// Also fires the async narrator when a new day begins (hour === 0, day > 0).
let lastNarratorDay = -1;
loop.register((ctx) => {
  const prevPendingCount = simulationStore.ctx.pendingDecisions.length;
  simulationStore.ctx = ctx;

  // Auto-pause when a new decision moment appears so the player can act on it.
  // Skipped when Divine Intervention is hidden — the ChoiceCard never renders,
  // so pausing here would freeze the loop with no way to resume.
  if (FEATURES.divineIntervention && ctx.pendingDecisions.length > prevPendingCount && simulationStore.speed !== 'paused') {
    simulationStore.speedBeforePause = simulationStore.speed;
    setSpeed('paused');
  }

  const { day, hour } = ctx.worldTime;
  if (hour === 0 && day > 0 && day !== lastNarratorDay) {
    lastNarratorDay = day;
    const prevDay = day - 1;
    fetchDaySummary(prevDay, ctx).then(text => {
      if (text) {
        // Replace map to trigger Svelte reactivity
        simulationStore.daySummaries = new Map(simulationStore.daySummaries).set(prevDay, text);
      }
    });
  }

  return ctx;
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function doDispatch(cmd: DispatchCommand): boolean {
  const result = dispatch(simulationStore.ctx, cmd);
  if (result.ok) {
    simulationStore.ctx = result.ctx;
    loop.setContext(result.ctx);
    // Resume the loop when the last pending decision is resolved
    if (cmd.type === 'CHOOSE_OPTION' && result.ctx.pendingDecisions.length === 0 && simulationStore.speed === 'paused') {
      setSpeed(simulationStore.speedBeforePause);
    }
    return true;
  }
  return false;
}

export function setSpeed(speed: 1 | 5 | 20 | 'paused'): void {
  simulationStore.speed = speed;
  if (speed === 'paused') {
    loop.pause();
  } else {
    loop.setSpeed(speed);
    loop.resume();
  }
}

export function selectAdventurer(id: string | null): void {
  simulationStore.selectedAdventurerId = id;
}

export function setActiveTab(tab: typeof simulationStore.activeTab): void {
  simulationStore.activeTab = tab;
  if (tab === 'events') {
    simulationStore.eventsLastReadTick = simulationStore.ctx.worldTime.tick;
  }
}

// ---------------------------------------------------------------------------
// Derived helpers (computed in .svelte files via $derived, but convenience
// functions exported here for shared logic)
// ---------------------------------------------------------------------------

export function unreadEventCount(ctx: SimulationContext, lastReadTick: number): number {
  // Exclude kinds for hidden features so the badge matches what the feed shows.
  const hidden = hiddenEventKinds();
  return ctx.eventLog.filter(e => e.tick > lastReadTick && !hidden.has(e.kind)).length;
}
