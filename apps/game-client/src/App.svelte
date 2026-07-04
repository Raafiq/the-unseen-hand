<script lang="ts">
  import {
    simulationStore,
    proceed,
    focusChapter,
    selectAdventurer,
    doDispatch,
  } from './lib/simulationStore.svelte';
  import RosterDock from './lib/components/RosterDock.svelte';
  import EventFeed from './lib/components/EventFeed.svelte';
  import CharacterDetail from './lib/components/CharacterDetail.svelte';
  import NpcDetail from './lib/components/NpcDetail.svelte';
  import ChoiceCard from './lib/components/ChoiceCard.svelte';
  import { slide } from 'svelte/transition';
  import { FEATURES } from './lib/featureFlags';
  import { renderThought, cycleOf, type Cycle, type DecisionMoment } from '@ugs/core';

  const ctx = $derived(simulationStore.ctx);
  const selectedId = $derived(simulationStore.selectedAdventurerId);

  const CYCLE_LABEL: Record<Cycle, string> = { MORNING: 'Morning', AFTERNOON: 'Afternoon', NIGHT: 'Night' };

  // The date reads as the cycle we're poised on, not a wall-clock hour (app-shell.md §"Top bar").
  const dateLabel = $derived(`Day ${ctx.worldTime.day} · ${CYCLE_LABEL[ctx.worldTime.cycle]}`);

  // The interim Proceed button (p15d) names where the *next* cycle lands. p15e formalises the
  // top bar (removes the deprecated speed API entirely and owns the final control styling).
  const nextLabel = $derived.by(() => {
    const { day, hour } = ctx.worldTime;
    const nextHour = hour + 8;
    if (nextHour >= 24) return `Proceed to Day ${day + 1}`;
    return `Proceed to ${CYCLE_LABEL[cycleOf(nextHour)]}`;
  });

  function handleProceed() {
    proceed();
  }

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

  // Resolve a decision moment's subjectId (comma-joined actor ids) to named current
  // thoughts (thought-system.md — decision-card surface). Pure on-demand renders;
  // the auto-pause freezes the tick, so the text is stable while the card is up.
  function getSubjectThoughts(moment: DecisionMoment): Array<{ id: string; name: string; thought: string }> {
    if (!moment.subjectId) return [];
    return moment.subjectId
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0)
      .map(id => {
        const name = ctx.adventurers.get(id)?.identity.name ?? ctx.notableNpcs.get(id)?.name;
        const thought = renderThought(ctx, id);
        return name && thought ? { id, name, thought: thought.text } : undefined;
      })
      .filter((st): st is { id: string; name: string; thought: string } => st !== undefined);
  }
</script>

<div class="app">
  <!-- Top bar -->
  <header class="topbar">
    <div class="world-name">{worldName}</div>
    <div class="world-time">{dateLabel}</div>

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

    <!-- Proceed — the sole tempo control (turn-paced world halts between cycles). -->
    <button class="proceed-btn" onclick={handleProceed}>{nextLabel} ›</button>
  </header>

  <div class="content">
    <!-- Main panel — the event feed is always in view -->
    <main class="main-panel">
      <EventFeed
        {ctx}
        cycleReads={simulationStore.cycleReadsHistory}
        chapterFocus={simulationStore.chapterFocus}
        onSelectAdventurer={(id) => { selectAdventurer(id); }}
        onFocusChapter={(id) => focusChapter(id)}
      />
    </main>

    <!-- Right panel — your divine dashboard: scenario status, or an active ChoiceCard -->
    <aside class="right-panel" class:has-moment={hasPendingMoment}>
      {#if hasPendingMoment}
        <ChoiceCard
          moments={ctx.pendingDecisions}
          di={ctx.divineInfluence}
          tick={ctx.worldTime.tick}
          {getSubjectThoughts}
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
      onSelect={(id) => { selectAdventurer(id); if (id) focusChapter(id); }}
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

  .proceed-btn {
    margin-left: auto; padding: 7px 18px;
    background: #5b4fcf; border: 1px solid #7b6fe8; border-radius: 6px;
    color: #fff; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 600;
    letter-spacing: 0.02em; transition: background 0.15s, transform 0.05s;
  }
  .proceed-btn:hover { background: #6b5fe0; }
  .proceed-btn:active { transform: translateY(1px); }

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
