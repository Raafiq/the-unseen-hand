<script lang="ts">
  import type { SimulationContext, SimulationEvent } from '@ugs/core';

  interface Props {
    ctx: SimulationContext;
    onSelectAdventurer: (id: string) => void;
  }

  const { ctx, onSelectAdventurer }: Props = $props();

  type EventKind = SimulationEvent['kind'];
  type FilterKey = EventKind | 'ALL';

  let activeFilters = $state<Set<FilterKey>>(new Set(['ALL']));

  const KIND_LABELS: Record<EventKind, { label: string; cls: string }> = {
    SOCIAL:         { label: 'Social',    cls: 'tag-social' },
    COMBAT:         { label: 'Combat',    cls: 'tag-combat' },
    QUEST:          { label: 'Quest',     cls: 'tag-quest' },
    LIFECYCLE:      { label: 'Lifecycle', cls: 'tag-lifecycle' },
    WORLD:          { label: 'World',     cls: 'tag-world' },
    DIVINE:         { label: 'Divine',    cls: 'tag-divine' },
    DECISION_MOMENT:{ label: 'Decision',  cls: 'tag-decision' },
  };

  const ALL_KINDS: EventKind[] = ['SOCIAL', 'COMBAT', 'QUEST', 'LIFECYCLE', 'WORLD', 'DIVINE'];

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

  function tickToLabel(tick: number): string {
    const day = Math.floor(tick / 24);
    const hour = tick % 24;
    return `Day ${day}, ${String(hour).padStart(2,'0')}:00`;
  }

  const visibleEvents = $derived(() => {
    const log = [...ctx.eventLog].reverse(); // newest first
    const filtered = activeFilters.has('ALL')
      ? log
      : log.filter(e => activeFilters.has(e.kind as FilterKey));
    return filtered.slice(0, 200); // show last 200
  });

  function getInvolvedIds(event: SimulationEvent): string[] {
    if ('involvedIds' in event) return (event as any).involvedIds ?? [];
    if ('participantIds' in event) return (event as any).participantIds ?? [];
    return [];
  }

  function portraitColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 50%, 40%)`;
  }

  function advName(id: string): string {
    return ctx.adventurers.get(id)?.identity.name ?? id;
  }
</script>

<div class="feed">
  <!-- Filter bar -->
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

  <!-- Event list (virtualized via slice) -->
  <div class="event-list">
    {#each visibleEvents() as event (event.id)}
      <div class="event-row">
        <span class="time-label">{tickToLabel(event.tick)}</span>
        <span class="type-tag {KIND_LABELS[event.kind]?.cls ?? ''}">
          {KIND_LABELS[event.kind]?.label ?? event.kind}
        </span>
        <span class="event-text">{event.renderedText}</span>
        {#if getInvolvedIds(event).length > 0}
          <div class="involved">
            {#each getInvolvedIds(event) as id (id)}
              <button
                class="portrait-init"
                title={advName(id)}
                style="background:{portraitColor(id)}"
                onclick={() => onSelectAdventurer(id)}
              >
                {advName(id)[0] ?? '?'}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    {#if ctx.eventLog.length === 0}
      <p class="empty">No events yet — the simulation is just getting started.</p>
    {/if}
  </div>
</div>

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
  .tag-world.active    { background: #0a1a2e; color: #42a5f5; border-color: #42a5f5; }
  .tag-divine.active   { background: #2e2200; color: #ffd54f; border-color: #ffd54f; }
  .tag-decision.active { background: #1a0a2e; color: #7e57c2; border-color: #7e57c2; }

  .event-list { flex: 1; overflow-y: auto; }

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
  .tag-world    { background: #0a1a2e; color: #42a5f5; }
  .tag-divine   { background: #2e2200; color: #ffd54f; }
  .tag-decision { background: #1a0a2e; color: #7e57c2; }

  .event-text { flex: 1; font-size: 13px; color: #c8c0b4; line-height: 1.4; min-width: 160px; }

  .involved { display: flex; gap: 4px; margin-top: 4px; flex-basis: 100%; padding-left: 96px; }
  .portrait-init {
    width: 20px; height: 20px; border-radius: 50%; font-size: 10px;
    font-weight: bold; color: #fff; cursor: pointer; border: none;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .portrait-init:hover { opacity: 0.8; transform: scale(1.1); }

  .empty { color: #666; font-size: 13px; padding: 20px 0; }
</style>
