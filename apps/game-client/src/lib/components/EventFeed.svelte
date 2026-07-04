<script lang="ts">
  import type { SimulationContext, SimulationEvent, CombatBeat } from '@ugs/core';
  import CombatReplay from './CombatReplay.svelte';
  import { hiddenEventKinds } from '../featureFlags';
  import { portraitSrc, portraitColor } from '../portraits';

  interface Props {
    ctx: SimulationContext;
    daySummaries: Map<number, string>;
    onSelectAdventurer: (id: string) => void;
  }

  const { ctx, daySummaries, onSelectAdventurer }: Props = $props();

  type EventKind = SimulationEvent['kind'];
  type FilterKey = EventKind | 'ALL';

  let activeFilters = $state<Set<FilterKey>>(new Set(['ALL']));
  let adventurerFilter = $state<string | null>(null);

  const KIND_LABELS: Record<EventKind, { label: string; cls: string }> = {
    SOCIAL:         { label: 'Social',    cls: 'tag-social' },
    NPC:            { label: 'Townsfolk', cls: 'tag-social' },
    COMBAT:         { label: 'Combat',    cls: 'tag-combat' },
    QUEST:          { label: 'Quest',     cls: 'tag-quest' },
    LIFECYCLE:      { label: 'Lifecycle', cls: 'tag-lifecycle' },
    RELATIONSHIP:   { label: 'Bonds',     cls: 'tag-relationship' },
    WORLD:          { label: 'World',     cls: 'tag-world' },
    DIVINE:         { label: 'Divine',    cls: 'tag-divine' },
    DECISION_MOMENT:{ label: 'Decision',  cls: 'tag-decision' },
    ACTIVITY:       { label: 'Activity',  cls: 'tag-world' },
    THOUGHT:        { label: 'Thought',   cls: 'tag-thought' },
  };

  // Kinds whose owning feature is currently hidden (featureFlags) — dropped from
  // both the filter chips and the rendered rows below.
  const HIDDEN_KINDS = hiddenEventKinds();

  const ALL_KINDS: EventKind[] = (['SOCIAL', 'NPC', 'COMBAT', 'QUEST', 'LIFECYCLE', 'RELATIONSHIP', 'WORLD', 'DIVINE', 'ACTIVITY', 'THOUGHT'] as EventKind[])
    .filter(k => !HIDDEN_KINDS.has(k));

  function toggleFilter(key: FilterKey) {
    if (key === 'ALL') {
      activeFilters = new Set(['ALL']);
    } else {
      const next = new Set(activeFilters);
      next.delete('ALL');
      if (next.has(key)) {
        next.delete(key);
        if (next.size === 0) next.add('ALL');
      } else {
        next.add(key);
      }
      activeFilters = next;
    }
  }

  function tickToHour(tick: number): string {
    const hour = tick % 24;
    return `${String(hour).padStart(2,'0')}:00`;
  }

  type DayGroup = { day: number; summary: string | null; events: SimulationEvent[] };

  const dayGroups = $derived((): DayGroup[] => {
    const log = [...ctx.eventLog]
      .reverse() // newest first
      .filter(e => !HIDDEN_KINDS.has(e.kind)); // drop kinds for hidden features, even under "All"
    const filtered = (activeFilters.has('ALL')
      ? log
      : log.filter(e => activeFilters.has(e.kind as FilterKey)))
      .filter(e => !adventurerFilter || getInvolvedIds(e).includes(adventurerFilter));
    const sliced = filtered.slice(0, 200);

    // Group by day, preserving newest-first order within each day
    const grouped = new Map<number, SimulationEvent[]>();
    for (const e of sliced) {
      const day = Math.floor(e.tick / 24);
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(e);
    }

    // Sort days newest first
    return [...grouped.entries()]
      .sort(([a], [b]) => b - a)
      .map(([day, events]) => ({ day, summary: daySummaries.get(day) ?? null, events }));
  });

  function getInvolvedIds(event: SimulationEvent): string[] {
    if ('actorId' in event) return [(event as any).actorId]; // THOUGHT — the thinker
    if ('involvedIds' in event) return (event as any).involvedIds ?? [];
    if ('participantIds' in event) return (event as any).participantIds ?? [];
    if ('partyIds' in event) return (event as any).partyIds ?? [];
    if ('adventurerId' in event) return [(event as any).adventurerId];
    return [];
  }

  // Resolve any actor id — adventurer or Tier A notable NPC — to a display name.
  function advName(id: string): string {
    return ctx.adventurers.get(id)?.identity.name ?? ctx.notableNpcs.get(id)?.name ?? id;
  }

  // Character-filter chips: adventurers plus notable NPCs (both are graph actors and can be
  // event participants, so both must be filterable — npc-system.md).
  const filterActors = $derived([
    ...[...ctx.adventurers.values()].map(a => ({ id: a.id, name: a.identity.name })),
    ...[...ctx.notableNpcs.values()].map(n => ({ id: n.id, name: n.name })),
  ]);

  // ---------------------------------------------------------------------------
  // Combat Replay modal
  // ---------------------------------------------------------------------------

  type ReplayTarget = {
    questName: string;
    success: boolean;
    beats: CombatBeat[];
  } | null;

  let replayTarget = $state<ReplayTarget>(null);

  function openReplay(event: SimulationEvent) {
    if (event.kind !== 'COMBAT' || event.subtype !== 'BEAT_LOG') return;
    if (!event.beats?.length) return;
    replayTarget = {
      questName: `Quest ${event.questId}`,
      success: event.success ?? true,
      beats: event.beats,
    };
  }
</script>

<div class="feed">
  <!-- Kind filter bar -->
  <div class="filter-bar">
    <button
      class="filter-btn"
      class:active={activeFilters.has('ALL')}
      onclick={() => toggleFilter('ALL')}
    >All</button>
    {#each ALL_KINDS as kind (kind)}
      <button
        class="filter-btn {KIND_LABELS[kind].cls}"
        class:active={activeFilters.has(kind)}
        onclick={() => toggleFilter(kind)}
      >{KIND_LABELS[kind].label}</button>
    {/each}
  </div>

  <!-- Character filter bar -->
  <div class="char-filter-bar">
    <button
      class="filter-btn char-btn"
      class:active={!adventurerFilter}
      onclick={() => adventurerFilter = null}
    >All chars</button>
    {#each filterActors as actor (actor.id)}
      <button
        class="filter-btn char-btn"
        class:active={adventurerFilter === actor.id}
        onclick={() => adventurerFilter = adventurerFilter === actor.id ? null : actor.id}
      >
        <span class="char-dot" style="background:{portraitColor(actor.id)}"></span>
        {actor.name}
      </button>
    {/each}
  </div>

  <!-- Event list grouped by day, newest first -->
  <div class="event-list">
    {#each dayGroups() as group (group.day)}
      <div class="day-group">
        <div class="day-header">Day {group.day}</div>
        {#if group.summary}
          <div class="day-summary">
            <span class="summary-label">Day {group.day} — Fate's Record</span>
            <p class="summary-prose">{group.summary}</p>
          </div>
        {/if}
        {#each group.events as event (event.id)}
          <div class="event-row">
            <span class="time-label">{tickToHour(event.tick)}</span>
            <span class="type-tag {KIND_LABELS[event.kind]?.cls ?? ''}">
              {KIND_LABELS[event.kind]?.label ?? event.kind}
            </span>
            <span class="event-text" class:thought-text={event.kind === 'THOUGHT'}>{event.renderedText}</span>
            {#if event.kind === 'COMBAT' && event.subtype === 'BEAT_LOG' && event.beats?.length}
              <button class="replay-btn" onclick={() => openReplay(event)}>Replay</button>
            {/if}
            {#if getInvolvedIds(event).length > 0}
              <div class="involved">
                {#each getInvolvedIds(event) as id (id)}
                  {@const psrc = portraitSrc(id)}
                  <button
                    class="portrait-init"
                    title={advName(id)}
                    style={psrc ? '' : `background:${portraitColor(id)}`}
                    onclick={() => (ctx.adventurers.has(id) || ctx.notableNpcs.has(id)) && onSelectAdventurer(id)}
                  >
                    {#if psrc}
                      <img src={psrc} alt={advName(id)} />
                    {:else}
                      {advName(id)[0] ?? '?'}
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
    {#if ctx.eventLog.length === 0}
      <p class="empty">No events yet — the simulation is just getting started.</p>
    {/if}
  </div>
</div>

{#if replayTarget}
  <CombatReplay
    questName={replayTarget.questName}
    success={replayTarget.success}
    beats={replayTarget.beats}
    adventurers={ctx.adventurers}
    onClose={() => { replayTarget = null; }}
  />
{/if}

<style>
  .feed { display: flex; flex-direction: column; height: 100%; }

  .filter-bar {
    display: flex; flex-wrap: wrap; gap: 4px; padding-bottom: 12px;
    border-bottom: 1px solid #2e2a3a; margin-bottom: 10px;
  }
  .filter-btn {
    padding: 3px 10px; border-radius: 4px; border: 1px solid #44405a;
    background: #1a1820; color: #888; cursor: pointer; font-size: 11px;
  }
  .filter-btn:hover { background: #2e2a3a; color: #ccc; }
  .filter-btn.active { color: #fff; border-color: currentColor; }

  .tag-social.active   { background: #0a2e2e; color: #26c6da; border-color: #26c6da; }
  .tag-combat.active   { background: #2e0a0a; color: #ef5350; border-color: #ef5350; }
  .tag-quest.active    { background: #2e1a00; color: #ff9800; border-color: #ff9800; }
  .tag-lifecycle.active{ background: #1e0a2e; color: #ab47bc; border-color: #ab47bc; }
  .tag-relationship.active{ background: #2e0a1e; color: #ec407a; border-color: #ec407a; }
  .tag-world.active    { background: #0a1a2e; color: #42a5f5; border-color: #42a5f5; }
  .tag-divine.active   { background: #2e2200; color: #ffd54f; border-color: #ffd54f; }
  .tag-decision.active { background: #1a0a2e; color: #7e57c2; border-color: #7e57c2; }
  .tag-thought.active  { background: #22222a; color: #9a93a8; border-color: #9a93a8; }

  .char-filter-bar {
    display: flex; flex-wrap: wrap; gap: 4px; padding-bottom: 10px;
    border-bottom: 1px solid #2e2a3a; margin-bottom: 10px;
  }
  .char-btn { display: flex; align-items: center; gap: 5px; }
  .char-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .event-list { flex: 1; overflow-y: auto; }

  .day-group { margin-bottom: 4px; }
  .day-header {
    font-size: 10px; font-variant: small-caps; letter-spacing: 0.08em;
    color: #555; padding: 10px 0 4px; border-top: 1px solid #2a2730;
    margin-top: 6px;
  }
  .day-group:first-child .day-header { border-top: none; margin-top: 0; }

  .day-summary {
    background: #1a1630; border-left: 2px solid #7e57c2;
    padding: 8px 10px; margin-bottom: 6px; border-radius: 0 4px 4px 0;
  }
  .summary-label {
    display: block; font-size: 9px; font-variant: small-caps; letter-spacing: 0.1em;
    color: #7e57c2; margin-bottom: 4px;
  }
  .summary-prose {
    margin: 0; font-size: 12px; color: #b0a8c8; line-height: 1.5; font-style: italic;
  }

  .event-row {
    display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px;
    padding: 8px 0; border-bottom: 1px solid #1e1c24;
  }
  .event-row:last-child { border-bottom: none; }

  .time-label { font-size: 10px; color: #555; min-width: 90px; flex-shrink: 0; margin-top: 1px; }
  .type-tag {
    font-size: 10px; padding: 1px 6px; border-radius: 3px;
    font-weight: 600; flex-shrink: 0; align-self: flex-start;
  }
  .tag-social   { background: #0a2e2e; color: #26c6da; }
  .tag-combat   { background: #2e0a0a; color: #ef5350; }
  .tag-quest    { background: #2e1a00; color: #ff9800; }
  .tag-lifecycle{ background: #1e0a2e; color: #ab47bc; }
  .tag-relationship{ background: #2e0a1e; color: #ec407a; }
  .tag-world    { background: #0a1a2e; color: #42a5f5; }
  .tag-divine   { background: #2e2200; color: #ffd54f; }
  .tag-decision { background: #1a0a2e; color: #7e57c2; }
  .tag-thought  { background: #22222a; color: #9a93a8; }

  .event-text { flex: 1; font-size: 13px; color: #c8c0b4; line-height: 1.4; min-width: 160px; }
  .thought-text { font-style: italic; color: #a49cb4; }

  .involved { display: flex; gap: 4px; margin-top: 4px; flex-basis: 100%; padding-left: 96px; }
  .portrait-init {
    width: 20px; height: 20px; border-radius: 50%; font-size: 10px;
    font-weight: bold; color: #fff; cursor: pointer; border: none;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden; padding: 0;
  }
  .portrait-init img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .portrait-init:hover { opacity: 0.8; transform: scale(1.1); }

  .empty { color: #666; font-size: 13px; padding: 20px 0; }

  .replay-btn {
    padding: 1px 8px; border-radius: 3px; border: 1px solid #44405a;
    background: #1a1630; color: #9575cd; cursor: pointer; font-size: 10px;
    flex-shrink: 0; align-self: flex-start;
  }
  .replay-btn:hover { background: #2e2060; color: #ce93d8; }
</style>
