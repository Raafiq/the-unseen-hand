/**
 * simulationStore — Svelte 5 reactive state bridging @ugs/core SimulationLoop.
 *
 * Svelte 5 store rule: always `export const store = $state({...})`, never `export let x = $state(...)`.
 */
import {
  SimulationLoop,
  createScenario1Context,
  dispatch,
  type DispatchCommand,
  type SimulationContext,
} from '@ugs/core';

// Import to trigger registration
import '@ugs/core';

// Create the initial context with Scenario 1
const initialCtx = createScenario1Context();

// Single SimulationLoop instance
export const loop = new SimulationLoop(initialCtx);

// ---------------------------------------------------------------------------
// Svelte 5 reactive store
// ---------------------------------------------------------------------------

export const simulationStore = $state({
  ctx: initialCtx as SimulationContext,
  speed: 1 as 1 | 5 | 20 | 'paused',
  selectedAdventurerId: null as string | null,
  activeTab: 'roster' as 'roster' | 'quests' | 'world' | 'events',
  eventsLastReadTick: -1, // tick when Events tab was last opened; drives unread badge
});

// Register a render observer at the end of the subscriber chain
// This runs after all other subscribers and syncs ctx to the Svelte store.
loop.register((ctx) => {
  simulationStore.ctx = ctx;
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
  return ctx.eventLog.filter(e => e.tick > lastReadTick).length;
}
