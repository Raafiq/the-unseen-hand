<script lang="ts">
  import {
    simulationStore,
    setSpeed,
    selectAdventurer,
    doDispatch,
    loop,
  } from './lib/simulationStore.svelte';
  import RosterDock from './lib/components/RosterDock.svelte';
  import EventFeed from './lib/components/EventFeed.svelte';
  import CharacterDetail from './lib/components/CharacterDetail.svelte';
  import NpcDetail from './lib/components/NpcDetail.svelte';
  import ChoiceCard from './lib/components/ChoiceCard.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { slide } from 'svelte/transition';
  import { FEATURES } from './lib/featureFlags';

  onMount(() => {
    loop.start();
  });

  onDestroy(() => {
    loop.stop();
  });

  const ctx = $derived(simulationStore.ctx);
  const speed = $derived(simulationStore.speed);
  const selectedId = $derived(simulationStore.selectedAdventurerId);

  const hasPendingMoment = $derived(FEATURES.divineIntervention && ctx.pendingDecisions.length > 0);
  const worldName = $derived(
    ctx.scenario ? 'The Failing Guild' : 'Sandbox'
  );
  const diColor = $derived(
    ctx.divineInfluence >= 60 ? 'di-green' :
    ctx.divineInfluence >= 25 ? 'di-amber' : 'di-red'
  );

  // Floating DI deltas
  type DiDelta = { id: number; amount: number };
  let diDeltas = $state<DiDelta[]>([]);
  let _prevDI = -1; // -1 = uninitialized; first effect run sets baseline without emitting a delta
  let _deltaSeq = 0;

  $effect(() => {
    const current = ctx.divineInfluence;
    if (_prevDI >= 0) {
      const diff = Math.round(current - _prevDI);
      if (diff !== 0) {
        const id = ++_deltaSeq;
        diDeltas = [...diDeltas, { id, amount: diff }];
        setTimeout(() => { diDeltas = diDeltas.filter(d => d.id !== id); }, 1500);
      }
    }
    _prevDI = current;
  });

  function handleSpeedClick(s: 1 | 5 | 20 | 'paused') {
    setSpeed(s);
  }
</script>

<div class="app">
  <!-- Top bar -->
  <header class="topbar">
    <div class="world-name">{worldName}</div>
    <div class="world-time">
      Day {ctx.worldTime.day}, {String(ctx.worldTime.hour).padStart(2,'0')}:00
    </div>

    <!-- DI Meter -->
    {#if FEATURES.divineIntervention}
      <div class="di-meter" title="Divine Influence fuels your interventions. You gain it from quest completions, relationship milestones, personal goal achievements, and deaths you choose not to prevent. You spend it on divine touches, event seeding, difficulty shifts, and decision moment options. Spending everything makes you helpless. Letting the world breathe makes you powerful.">
        <span class="di-label">DI</span>
        <div class="di-bar-bg">
          <div class="di-bar-fill {diColor}" style="width: {ctx.divineInfluence}%"></div>
        </div>
        <span class="di-value">{ctx.divineInfluence}</span>
        {#each diDeltas as d (d.id)}
          <span class="di-delta" class:di-delta-pos={d.amount > 0} class:di-delta-neg={d.amount < 0}>
            {d.amount > 0 ? '+' : ''}{d.amount}
          </span>
        {/each}
      </div>
    {/if}

    <!-- Speed controls -->
    <div class="speed-controls">
      <button
        class="speed-btn"
        class:active={speed === 'paused'}
        onclick={() => handleSpeedClick('paused')}
      >⏸</button>
      <button
        class="speed-btn"
        class:active={speed === 1}
        onclick={() => handleSpeedClick(1)}
      >1×</button>
      <button
        class="speed-btn"
        class:active={speed === 5}
        onclick={() => handleSpeedClick(5)}
      >5×</button>
      <button
        class="speed-btn"
        class:active={speed === 20}
        onclick={() => handleSpeedClick(20)}
      >20×</button>
    </div>
  </header>

  <div class="content">
    <!-- Main panel — the event feed is always in view -->
    <main class="main-panel">
      <EventFeed
        {ctx}
        daySummaries={simulationStore.daySummaries}
        onSelectAdventurer={(id) => { selectAdventurer(id); }}
      />
    </main>

    <!-- Right panel — your divine dashboard: scenario status, or an active ChoiceCard -->
    <aside class="right-panel" class:has-moment={hasPendingMoment}>
      {#if hasPendingMoment}
        <ChoiceCard
          moments={ctx.pendingDecisions}
          di={ctx.divineInfluence}
          tick={ctx.worldTime.tick}
          onChoose={(decisionId, optionIndex) =>
            doDispatch({ type: 'CHOOSE_OPTION', decisionId, optionIndex })}
        />
      {:else}
        <div class="right-default">
          <p>You are the unseen hand. Watch. Reach in when it matters.</p>
          {#if ctx.scenario}
            <div class="scenario-status">
              <h3>Scenario Status</h3>
              {#each ctx.scenario.goals as goal}
                <div class="goal-row" class:done={goal.completed}>
                  <span class="goal-check">{goal.completed ? '✓' : '○'}</span>
                  <span>{goal.description}</span>
                </div>
              {/each}
            </div>
          {/if}
          <div class="treasury-rep">
            <span>Treasury: {ctx.treasury}g</span>
            <span>Reputation: {ctx.reputation}</span>
          </div>
        </div>
      {/if}
    </aside>
  </div>

  <!-- Detail drawer — rises from the dock when an adventurer is selected -->
  {#if selectedId}
    <div class="detail-drawer" transition:slide={{ duration: 180 }}>
      <button class="drawer-close" title="Close" onclick={() => selectAdventurer(null)}>×</button>
      {#if ctx.notableNpcs.has(selectedId)}
        <NpcDetail
          {ctx}
          npcId={selectedId}
          variant="drawer"
          onSelectActor={(id) => selectAdventurer(id)}
        />
      {:else}
        <CharacterDetail
          {ctx}
          adventurerId={selectedId}
          variant="drawer"
          onSelectAdventurer={(id) => selectAdventurer(id)}
          onDispatch={doDispatch}
        />
      {/if}
    </div>
  {/if}

  <!-- Roster dock — persistent overlay pinned to the bottom -->
  <div class="roster-dock">
    <RosterDock
      {ctx}
      selectedId={selectedId}
      onSelect={(id) => selectAdventurer(id)}
    />
  </div>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { background: #0f0f12; color: #e0d8cc; font-family: 'Georgia', serif; font-size: 14px; }

  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* Top bar */
  .topbar {
    display: flex; align-items: center; gap: 16px;
    padding: 8px 16px; background: #1a1820; border-bottom: 1px solid #2e2a3a;
    flex-shrink: 0;
  }
  .world-name { font-weight: bold; font-size: 15px; color: #c9b8ff; min-width: 140px; }
  .world-time { color: #888; font-size: 12px; min-width: 100px; }

  .di-meter { display: flex; align-items: center; gap: 6px; flex: 1; max-width: 220px; position: relative; }
  .di-label { font-size: 11px; color: #888; }
  .di-bar-bg { flex: 1; height: 8px; background: #2e2a3a; border-radius: 4px; overflow: hidden; }
  .di-bar-fill { height: 100%; transition: width 0.3s; border-radius: 4px; }
  .di-green { background: #4caf50; }
  .di-amber { background: #ff9800; }
  .di-red { background: #f44336; }
  .di-value { font-size: 12px; color: #ccc; min-width: 28px; text-align: right; }

  @keyframes di-float {
    0%   { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-22px); }
  }
  .di-delta {
    position: absolute; right: -4px; top: -14px;
    font-size: 11px; font-weight: 700; pointer-events: none;
    animation: di-float 1.5s ease-out forwards;
  }
  .di-delta-pos { color: #4caf50; }
  .di-delta-neg { color: #ef5350; }

  .speed-controls { display: flex; gap: 4px; }
  .speed-btn {
    padding: 4px 10px; background: #2e2a3a; border: 1px solid #44405a;
    color: #ccc; cursor: pointer; border-radius: 4px; font-size: 12px;
  }
  .speed-btn:hover { background: #3e3a4a; }
  .speed-btn.active { background: #5b4fcf; border-color: #7b6fe8; color: #fff; }

  /* Layout — feed + right panel above, roster dock pinned below */
  .content { display: flex; flex: 1; overflow: hidden; min-height: 0; }

  /* Main panel */
  .main-panel { flex: 1; overflow-y: auto; padding: 16px; }

  /* Detail drawer — rises from the dock, reads as one unit with it */
  .detail-drawer {
    position: relative; flex-shrink: 0;
    max-height: 42vh; overflow-y: auto;
    background: #15131c; border-top: 2px solid #7b6fe8;
  }
  .drawer-close {
    position: absolute; top: 8px; right: 10px; z-index: 2;
    width: 24px; height: 24px; line-height: 1;
    background: #201d2c; border: 1px solid #3a3550; border-radius: 5px;
    color: #b7abe0; cursor: pointer; font-size: 16px;
  }
  .drawer-close:hover { background: #2a2640; color: #fff; }

  /* Roster dock */
  .roster-dock {
    flex-shrink: 0; height: 96px;
    background: #131218; border-top: 1px solid #2e2a3a;
  }

  /* Right panel */
  .right-panel {
    width: 280px; flex-shrink: 0; background: #131218;
    border-left: 1px solid #2e2a3a; overflow-y: auto;
  }
  .right-panel.has-moment { border-left-color: #7b6fe8; animation: pulse-border 2s infinite; }
  @keyframes pulse-border {
    0%, 100% { border-left-color: #7b6fe8; }
    50% { border-left-color: #c9b8ff; }
  }

  .right-default { padding: 20px 16px; }
  .right-default p { color: #888; font-style: italic; font-size: 13px; line-height: 1.5; }
  .scenario-status { margin-top: 20px; }
  .scenario-status h3 { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .goal-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px; font-size: 12px; color: #aaa; }
  .goal-row.done { color: #4caf50; }
  .goal-check { flex-shrink: 0; }
  .treasury-rep { margin-top: 16px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #888; }
</style>
