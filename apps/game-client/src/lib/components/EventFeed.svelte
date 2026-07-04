<script lang="ts">
  import type { SimulationContext, SimulationEvent, CombatBeat, Cycle } from '@ugs/core';
  import type { CycleReads, CycleChapter } from '../cycleNarrative';
  import { chapterCoParticipants } from '../cycleNarrative';
  import CombatReplay from './CombatReplay.svelte';
  import { hiddenEventKinds } from '../featureFlags';
  import { getInvolvedIds } from '../eventInvolvement';
  import { portraitSrc, portraitColor } from '../portraits';

  // The Cycle Reader (formerly the live event feed — file kept per specs/screens/event-feed.md).
  // Two layers: the per-character **spread** (overview + chapter cards) is the resting read; the
  // terse chronological **raw log** is one toggle beneath each cycle. Pure view over composed
  // `cycleReads` + the deterministic event log — it renders, it never narrates.
  interface Props {
    ctx: SimulationContext;
    /** Every composed cycle, oldest → newest (newest is the resting spread). */
    cycleReads: CycleReads[];
    /** Focus request from the dock / a co-participant initial: scroll to + highlight a chapter. */
    chapterFocus: { actorId: string; seq: number } | null;
    /** Open the character-detail drawer for an actor (chapter name, raw-log initial). */
    onSelectAdventurer: (id: string) => void;
    /** Focus another character's chapter in the spread (co-participant initial). */
    onFocusChapter: (id: string) => void;
  }

  const { ctx, cycleReads, chapterFocus, onSelectAdventurer, onFocusChapter }: Props = $props();

  type EventKind = SimulationEvent['kind'];
  type FilterKey = EventKind | 'ALL';

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

  const CYCLE_LABEL: Record<Cycle, string> = {
    MORNING: 'Morning', AFTERNOON: 'Afternoon', NIGHT: 'Night',
  };

  // Kinds whose owning feature is hidden (featureFlags) — dropped from raw-log rows and chips.
  const HIDDEN_KINDS = hiddenEventKinds();
  const ALL_KINDS: EventKind[] = (['SOCIAL', 'NPC', 'COMBAT', 'QUEST', 'LIFECYCLE', 'RELATIONSHIP', 'WORLD', 'DIVINE', 'ACTIVITY', 'THOUGHT'] as EventKind[])
    .filter(k => !HIDDEN_KINDS.has(k));

  // Virtualization: only the most recent spreads stay in the DOM (bounds a long run). Prior
  // cycles beyond the window scroll off; the resting position is always the newest spread.
  const MAX_SPREADS = 40;
  const spreads = $derived(cycleReads.slice(-MAX_SPREADS)); // oldest → newest

  // Raw-log open state is per spread (keyed by the cycle's fromTick); the kind filter is shared
  // across whichever raw logs are open (event-feed.md §"Filtering (raw log only)").
  let openRawLogs = $state<Set<number>>(new Set());
  let activeFilters = $state<Set<FilterKey>>(new Set(['ALL']));

  function toggleRawLog(key: number) {
    const next = new Set(openRawLogs);
    if (next.has(key)) next.delete(key); else next.add(key);
    openRawLogs = next;
  }

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

  // Resolve any actor id — adventurer or Tier A notable NPC — to a display name.
  function advName(id: string): string {
    return ctx.adventurers.get(id)?.identity.name ?? ctx.notableNpcs.get(id)?.name ?? id;
  }

  // Activate a chapter's co-participant initial: an adventurer has their own chapter, so focus it
  // (the POV-shaded shared moment); a notable NPC has no chapter, so open their townsfolk detail
  // instead of a dead click (event-feed.md §"Character chapter card").
  function activateCoParticipant(id: string) {
    if (ctx.adventurers.has(id)) onFocusChapter(id);
    else onSelectAdventurer(id);
  }

  // Raw-log time label: "Day {day}, hour {hh}" (event-feed.md §"Raw log").
  function timeLabel(tick: number): string {
    return `Day ${Math.floor(tick / 24)}, hour ${String(tick % 24).padStart(2, '0')}`;
  }

  // Living adventurers first, then the fallen/departed — matches the roster dock ordering so the
  // spread reads top-down as the living guild (event-feed.md §"Character chapters").
  function chapterRank(actorId: string): number {
    const adv = ctx.adventurers.get(actorId);
    return adv && (adv.state === 'DEAD' || adv.state === 'RETIRED') ? 1 : 0;
  }
  function sortChapters(chapters: CycleChapter[]): CycleChapter[] {
    return [...chapters].sort(
      (a, b) => chapterRank(a.actorId) - chapterRank(b.actorId) || a.name.localeCompare(b.name),
    );
  }

  // The chronological raw-log rows for one cycle: its tick window, minus hidden kinds, then the
  // active kind filter, oldest → newest (the cycle's timeline reads naturally forward).
  function rawEvents(reads: CycleReads): SimulationEvent[] {
    const { fromTick, toTick } = reads.digest;
    return ctx.eventLog
      .filter(e => e.tick > fromTick && e.tick <= toTick)
      .filter(e => !HIDDEN_KINDS.has(e.kind))
      .filter(e => activeFilters.has('ALL') || activeFilters.has(e.kind as FilterKey))
      .sort((a, b) => a.tick - b.tick);
  }

  // ---------------------------------------------------------------------------
  // Chapter focus — scroll to + highlight a character's card (dock / co-participant)
  // ---------------------------------------------------------------------------

  let containerEl: HTMLElement;
  let focusedActorId = $state<string | null>(null);
  let focusTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const req = chapterFocus; // depend on the whole request (seq bumps re-focus of same actor)
    if (!req) return;
    queueMicrotask(() => {
      const cards = containerEl?.querySelectorAll<HTMLElement>(`[data-chapter-actor="${req.actorId}"]`);
      const card = cards?.[cards.length - 1]; // the newest spread's card for this actor
      if (!card) return;
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      focusedActorId = req.actorId;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if (focusedActorId === req.actorId) focusedActorId = null;
      }, 1600);
    });
  });

  // Keep the newest spread at the resting position: scroll to the bottom when a cycle is added.
  let lastSpreadCount = 0;
  $effect(() => {
    const count = spreads.length;
    if (count !== lastSpreadCount) {
      lastSpreadCount = count;
      queueMicrotask(() => { if (containerEl) containerEl.scrollTop = containerEl.scrollHeight; });
    }
  });

  // ---------------------------------------------------------------------------
  // Combat Replay modal (raw-log drill-down affordance, preserved from the feed)
  // ---------------------------------------------------------------------------

  type ReplayTarget = { questName: string; success: boolean; beats: CombatBeat[] } | null;
  let replayTarget = $state<ReplayTarget>(null);

  function openReplay(event: SimulationEvent) {
    if (event.kind !== 'COMBAT' || event.subtype !== 'BEAT_LOG') return;
    if (!event.beats?.length) return;
    replayTarget = { questName: `Quest ${event.questId}`, success: event.success ?? true, beats: event.beats };
  }
</script>

<div class="reader" bind:this={containerEl}>
  {#if spreads.length === 0}
    <div class="reader-empty">
      <p class="empty-title">The guild waits between cycles.</p>
      <p class="empty-hint">Press <strong>Proceed</strong> to let the next morning, afternoon, or night unfold.</p>
    </div>
  {:else}
    {#each spreads as reads (reads.digest.fromTick)}
      {@const sorted = sortChapters(reads.chapters)}
      <section class="cycle-spread">
        <header class="spread-header">Day {reads.digest.day} · {CYCLE_LABEL[reads.digest.cycle]}</header>

        {#if reads.overview.trim()}
          <p class="cycle-overview">{reads.overview}</p>
        {/if}

        <div class="chapters">
          {#each sorted as ch (ch.actorId)}
            {@const psrc = portraitSrc(ch.actorId)}
            {@const others = chapterCoParticipants(ctx, reads.digest, ch.actorId)}
            <article
              class="chapter-card"
              class:focused={focusedActorId === ch.actorId}
              data-chapter-actor={ch.actorId}
            >
              <div class="chapter-head">
                {#if psrc}
                  <img class="chapter-portrait" src={psrc} alt={ch.name} />
                {:else}
                  <div class="chapter-portrait" style="background:{portraitColor(ch.actorId)}">{ch.name[0]}</div>
                {/if}
                <button class="chapter-name" onclick={() => onSelectAdventurer(ch.actorId)}>{ch.name}</button>
              </div>
              <p class="chapter-prose">{ch.text}</p>
              {#if others.length > 0}
                <div class="co-participants" aria-label="Shared this cycle with">
                  {#each others as id (id)}
                    {@const osrc = portraitSrc(id)}
                    <button
                      class="portrait-init"
                      title={advName(id)}
                      style={osrc ? '' : `background:${portraitColor(id)}`}
                      onclick={() => activateCoParticipant(id)}
                    >
                      {#if osrc}<img src={osrc} alt={advName(id)} />{:else}{advName(id)[0] ?? '?'}{/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
          {#if sorted.length === 0}
            <p class="spread-quiet">No one had a story worth telling this cycle.</p>
          {/if}
        </div>

        <!-- Raw log (secondary / drill-down): the deterministic ledger beneath the prose -->
        <div class="raw-log-section">
          <button
            class="raw-log-toggle"
            class:open={openRawLogs.has(reads.digest.fromTick)}
            onclick={() => toggleRawLog(reads.digest.fromTick)}
          >
            {openRawLogs.has(reads.digest.fromTick) ? '▾' : '▸'} Raw log
          </button>

          {#if openRawLogs.has(reads.digest.fromTick)}
            {@const rows = rawEvents(reads)}
            <div class="raw-log">
              <div class="filter-bar">
                <button class="filter-btn" class:active={activeFilters.has('ALL')} onclick={() => toggleFilter('ALL')}>All</button>
                {#each ALL_KINDS as kind (kind)}
                  <button
                    class="filter-btn {KIND_LABELS[kind].cls}"
                    class:active={activeFilters.has(kind)}
                    onclick={() => toggleFilter(kind)}
                  >{KIND_LABELS[kind].label}</button>
                {/each}
              </div>

              {#each rows as event (event.id)}
                <div class="event-row">
                  <span class="time-label">{timeLabel(event.tick)}</span>
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
                          {#if psrc}<img src={psrc} alt={advName(id)} />{:else}{advName(id)[0] ?? '?'}{/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
              {#if rows.length === 0}
                <p class="empty">No events match this filter.</p>
              {/if}
            </div>
          {/if}
        </div>
      </section>
    {/each}
  {/if}
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
  .reader { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }

  /* Empty state — before the first PROCEED there is no computed cycle to read. */
  .reader-empty {
    margin: auto; text-align: center; max-width: 380px; padding: 40px 20px; color: #6c6478;
  }
  .empty-title { font-size: 16px; color: #b0a8c8; margin-bottom: 8px; }
  .empty-hint { font-size: 13px; line-height: 1.6; }
  .empty-hint strong { color: #c9b8ff; }

  /* --- Cycle spread (primary read) --- */
  .cycle-spread { margin-bottom: 28px; }
  .cycle-spread:last-child { margin-bottom: 8px; }

  .spread-header {
    font-size: 12px; font-variant: small-caps; letter-spacing: 0.1em;
    color: #8a7fb0; padding-bottom: 8px; margin-bottom: 12px;
    border-bottom: 1px solid #2a2634;
  }

  .cycle-overview {
    background: #17152180; border-left: 3px solid #7b6fe8;
    padding: 10px 14px; margin-bottom: 16px; border-radius: 0 6px 6px 0;
    font-size: 14px; line-height: 1.6; color: #c3bcd6; font-style: italic;
  }

  .chapters { display: flex; flex-direction: column; gap: 12px; }

  .chapter-card {
    background: #17161d; border: 1px solid #26232f; border-radius: 8px;
    padding: 12px 14px; transition: border-color 0.2s, box-shadow 0.2s;
  }
  .chapter-card.focused {
    border-color: #7b6fe8; box-shadow: 0 0 0 1px #7b6fe8, 0 0 18px #7b6fe855;
  }

  .chapter-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .chapter-portrait {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-weight: bold; font-size: 15px; color: #fff; object-fit: cover;
  }
  .chapter-name {
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: inherit; font-size: 15px; font-weight: 600; color: #e6dff5;
  }
  .chapter-name:hover { color: #c9b8ff; text-decoration: underline; }

  .chapter-prose { margin: 0; font-size: 14px; line-height: 1.65; color: #cdc6bb; }

  .co-participants { display: flex; gap: 5px; margin-top: 10px; }

  .spread-quiet { font-size: 13px; color: #6c6478; font-style: italic; padding: 4px 0; }

  /* --- Raw log (secondary / drill-down) --- */
  .raw-log-section { margin-top: 12px; }
  .raw-log-toggle {
    background: none; border: none; cursor: pointer; padding: 4px 0;
    font-family: inherit; font-size: 11px; font-variant: small-caps; letter-spacing: 0.08em;
    color: #6c6478;
  }
  .raw-log-toggle:hover, .raw-log-toggle.open { color: #a89fc0; }

  .raw-log {
    margin-top: 6px; padding: 10px 12px;
    background: #121118; border: 1px solid #221f2b; border-radius: 6px;
  }

  .filter-bar {
    display: flex; flex-wrap: wrap; gap: 4px; padding-bottom: 10px;
    border-bottom: 1px solid #221f2b; margin-bottom: 8px;
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
  .tag-thought.active  { background: #22222a; color: #9a93a8; border-color: #9a93a8; }

  .event-row {
    display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px;
    padding: 6px 0; border-bottom: 1px solid #1a1822;
  }
  .event-row:last-child { border-bottom: none; }

  .time-label { font-size: 10px; color: #555; min-width: 110px; flex-shrink: 0; margin-top: 1px; }
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
  .tag-thought  { background: #22222a; color: #9a93a8; }

  .event-text { flex: 1; font-size: 13px; color: #c8c0b4; line-height: 1.4; min-width: 160px; }
  .thought-text { font-style: italic; color: #a49cb4; }

  .involved { display: flex; gap: 4px; margin-top: 4px; flex-basis: 100%; padding-left: 116px; }
  .portrait-init {
    width: 20px; height: 20px; border-radius: 50%; font-size: 10px;
    font-weight: bold; color: #fff; cursor: pointer; border: none;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden; padding: 0;
  }
  .portrait-init img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .portrait-init:hover { opacity: 0.85; transform: scale(1.1); }

  .empty { color: #666; font-size: 12px; padding: 6px 0; }

  .replay-btn {
    padding: 1px 8px; border-radius: 3px; border: 1px solid #44405a;
    background: #1a1630; color: #9575cd; cursor: pointer; font-size: 10px;
    flex-shrink: 0; align-self: flex-start;
  }
  .replay-btn:hover { background: #2e2060; color: #ce93d8; }
</style>
