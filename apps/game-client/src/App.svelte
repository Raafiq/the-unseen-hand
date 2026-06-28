<script lang="ts">
  import {
    simulationStore,
    setSpeed,
    setActiveTab,
    selectAdventurer,
    doDispatch,
    unreadEventCount,
    loop,
  } from './lib/simulationStore.svelte';
  import RosterGrid from './lib/components/RosterGrid.svelte';
  import EventFeed from './lib/components/EventFeed.svelte';
  import WorldPanel from './lib/components/WorldPanel.svelte';
  import CharacterDetail from './lib/components/CharacterDetail.svelte';
  import ChoiceCard from './lib/components/ChoiceCard.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { SimulationContext } from '@ugs/core';

  onMount(() => {
    loop.start();
  });

  onDestroy(() => {
    loop.stop();
  });

  const ctx = $derived(simulationStore.ctx);
  const speed = $derived(simulationStore.speed);
  const activeTab = $derived(simulationStore.activeTab);
  const selectedId = $derived(simulationStore.selectedAdventurerId);

  const unreadEvents = $derived(
    unreadEventCount(ctx, simulationStore.eventsLastReadTick)
  );
  const hasPendingMoment = $derived(ctx.pendingDecisions.length > 0);
  const worldName = $derived(
    ctx.scenario ? 'The Failing Guild' : 'Sandbox'
  );
  const diColor = $derived(
    ctx.divineInfluence >= 60 ? 'di-green' :
    ctx.divineInfluence >= 25 ? 'di-amber' : 'di-red'
  );

  function handleTabClick(tab: typeof activeTab) {
    setActiveTab(tab);
  }

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
    <div class="di-meter" title="Divine Influence fuels your interventions. You gain it from quest completions, relationship milestones, personal goal achievements, and deaths you choose not to prevent. You spend it on divine touches, event seeding, difficulty shifts, and decision moment options. Spending everything makes you helpless. Letting the world breathe makes you powerful.">
      <span class="di-label">DI</span>
      <div class="di-bar-bg">
        <div class="di-bar-fill {diColor}" style="width: {ctx.divineInfluence}%"></div>
      </div>
      <span class="di-value">{ctx.divineInfluence}</span>
    </div>

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

  <div class="main-layout">
    <!-- Left nav -->
    <nav class="nav-panel">
      <button
        class="nav-btn"
        class:active={activeTab === 'roster'}
        onclick={() => handleTabClick('roster')}
      >
        Roster
      </button>
      <button
        class="nav-btn"
        class:active={activeTab === 'quests'}
        onclick={() => handleTabClick('quests')}
      >
        Quests
        {#if hasPendingMoment}
          <span class="badge">!</span>
        {/if}
      </button>
      <button
        class="nav-btn"
        class:active={activeTab === 'world'}
        onclick={() => handleTabClick('world')}
      >World</button>
      <button
        class="nav-btn"
        class:active={activeTab === 'events'}
        onclick={() => handleTabClick('events')}
      >
        Events
        {#if unreadEvents > 0 && activeTab !== 'events'}
          <span class="badge">{unreadEvents > 99 ? '99+' : unreadEvents}</span>
        {/if}
      </button>
    </nav>

    <!-- Main panel -->
    <main class="main-panel">
      {#if activeTab === 'roster'}
        <RosterGrid
          {ctx}
          selectedId={selectedId}
          onSelect={(id) => selectAdventurer(id)}
        />
      {:else if activeTab === 'quests'}
        <div class="quest-board">
          <h2>Quest Board</h2>
          <p class="muted">Available: {ctx.questBoard.available.length} · Active: {ctx.questBoard.active.length}</p>
          {#each ctx.questBoard.available as quest}
            <div class="quest-card">
              <span class="quest-name">{quest.name}</span>
              <span class="quest-diff">d{quest.difficulty}</span>
              <span class="quest-reward">{quest.reward}g</span>
            </div>
          {/each}
          {#each ctx.questBoard.active as quest}
            <div class="quest-card active">
              <span class="quest-name">{quest.name}</span>
              <span class="badge-amber">Active</span>
              <span class="quest-reward">{quest.reward}g</span>
            </div>
          {/each}
          {#if ctx.questBoard.available.length === 0 && ctx.questBoard.active.length === 0}
            <p class="muted">No quests available — the board is empty.</p>
          {/if}
        </div>
      {:else if activeTab === 'world'}
        <WorldPanel {ctx} onDispatch={doDispatch} />
      {:else if activeTab === 'events'}
        <EventFeed
          {ctx}
          onSelectAdventurer={(id) => { selectAdventurer(id); }}
        />
      {/if}
    </main>

    <!-- Right panel -->
    <aside class="right-panel" class:has-moment={hasPendingMoment}>
      {#if hasPendingMoment}
        <ChoiceCard
          moments={ctx.pendingDecisions}
          di={ctx.divineInfluence}
          tick={ctx.worldTime.tick}
          onChoose={(decisionId, optionIndex) =>
            doDispatch({ type: 'CHOOSE_OPTION', decisionId, optionIndex })}
        />
      {:else if selectedId}
        <CharacterDetail
          {ctx}
          adventurerId={selectedId}
          onSelectAdventurer={(id) => selectAdventurer(id)}
          onDispatch={doDispatch}
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

  .di-meter { display: flex; align-items: center; gap: 6px; flex: 1; max-width: 220px; }
  .di-label { font-size: 11px; color: #888; }
  .di-bar-bg { flex: 1; height: 8px; background: #2e2a3a; border-radius: 4px; overflow: hidden; }
  .di-bar-fill { height: 100%; transition: width 0.3s; border-radius: 4px; }
  .di-green { background: #4caf50; }
  .di-amber { background: #ff9800; }
  .di-red { background: #f44336; }
  .di-value { font-size: 12px; color: #ccc; min-width: 28px; text-align: right; }

  .speed-controls { display: flex; gap: 4px; }
  .speed-btn {
    padding: 4px 10px; background: #2e2a3a; border: 1px solid #44405a;
    color: #ccc; cursor: pointer; border-radius: 4px; font-size: 12px;
  }
  .speed-btn:hover { background: #3e3a4a; }
  .speed-btn.active { background: #5b4fcf; border-color: #7b6fe8; color: #fff; }

  /* Layout */
  .main-layout { display: flex; flex: 1; overflow: hidden; }

  /* Nav */
  .nav-panel {
    width: 110px; flex-shrink: 0; background: #131218;
    border-right: 1px solid #2e2a3a; display: flex; flex-direction: column; padding: 8px 0;
  }
  .nav-btn {
    position: relative; padding: 10px 12px; background: none; border: none;
    color: #888; cursor: pointer; text-align: left; font-size: 13px;
    border-left: 3px solid transparent;
  }
  .nav-btn:hover { color: #ccc; background: #1e1c24; }
  .nav-btn.active { color: #c9b8ff; border-left-color: #7b6fe8; background: #1a1820; }

  /* Badge */
  .badge {
    position: absolute; top: 6px; right: 8px;
    background: #f44336; color: #fff; border-radius: 10px;
    font-size: 10px; padding: 1px 5px; font-style: normal;
  }

  /* Main panel */
  .main-panel { flex: 1; overflow-y: auto; padding: 16px; }

  /* Quest board */
  .quest-board h2 { font-size: 15px; margin-bottom: 8px; color: #c9b8ff; }
  .quest-card {
    display: flex; gap: 12px; align-items: center; padding: 8px 12px;
    background: #1a1820; border: 1px solid #2e2a3a; border-radius: 6px; margin-bottom: 6px;
  }
  .quest-card.active { border-color: #ff9800; }
  .quest-name { flex: 1; }
  .quest-diff { font-size: 12px; color: #888; }
  .quest-reward { font-size: 12px; color: #ffd700; }
  .badge-amber { background: #ff9800; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .muted { color: #666; font-size: 13px; margin-bottom: 8px; }

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
