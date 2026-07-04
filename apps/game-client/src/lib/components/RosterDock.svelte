<script lang="ts">
  import type { SimulationContext, Adventurer } from '@ugs/core';
  import { portraitSrc, portraitColor } from '../portraits';

  interface Props {
    ctx: SimulationContext;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
  }

  const { ctx, selectedId, onSelect }: Props = $props();

  const STATE_LABELS: Record<string, { label: string; cls: string }> = {
    IDLE:       { label: 'Idle',        cls: 'state-idle' },
    ON_QUEST:   { label: 'On Quest',    cls: 'state-quest' },
    IN_DUNGEON: { label: 'In Dungeon',  cls: 'state-quest' },
    RESTING:    { label: 'Resting',     cls: 'state-rest' },
    SOCIALIZING:{ label: 'Socializing', cls: 'state-social' },
    IN_DISPUTE: { label: 'In Dispute',  cls: 'state-dispute' },
    DEAD:       { label: 'Fallen',      cls: 'state-dead' },
    RETIRED:    { label: 'Departed',    cls: 'state-retired' },
  };

  function moodColor(mood: number): string {
    return mood >= 50 ? '#4caf50' : mood >= 25 ? '#ff9800' : '#f44336';
  }

  // Living first (sorted by name), then fallen/departed — a compact HUD strip.
  const dockAdventurers = $derived(
    [...ctx.adventurers.values()].sort((a, b) => {
      const rank = (adv: Adventurer) =>
        adv.state === 'DEAD' || adv.state === 'RETIRED' ? 1 : 0;
      return rank(a) - rank(b) || a.identity.name.localeCompare(b.identity.name);
    })
  );

  function isGone(adv: Adventurer): boolean {
    return adv.state === 'DEAD' || adv.state === 'RETIRED';
  }

  function handleCardClick(adv: Adventurer) {
    onSelect(selectedId === adv.id ? null : adv.id);
  }
</script>

<div class="dock" aria-label="Roster">
  {#if dockAdventurers.length === 0}
    <p class="empty">No adventurers yet.</p>
  {:else}
    {#each dockAdventurers as adv (adv.id)}
      {@const src = portraitSrc(adv.id)}
      <button
        class="card"
        class:gone={isGone(adv)}
        class:selected={adv.id === selectedId}
        onclick={() => handleCardClick(adv)}
      >
        {#if src}
          <img class="portrait" class:desaturated={isGone(adv)} {src} alt={adv.identity.name} />
        {:else}
          <div class="portrait" class:desaturated={isGone(adv)} style="background:{portraitColor(adv.id)}">
            {adv.identity.name[0]}
          </div>
        {/if}
        <div class="card-body">
          <span class="name" class:strikethrough={adv.state === 'DEAD'} class:italic={adv.state === 'RETIRED'}>
            {adv.identity.name}
          </span>
          <span class="state-badge {STATE_LABELS[adv.state]?.cls}">
            {STATE_LABELS[adv.state]?.label ?? adv.state}
          </span>
          {#if !isGone(adv)}
            <div class="mood-bar-bg">
              <div class="mood-bar-fill" style="width:{Math.round(adv.mood)}%;background:{moodColor(adv.mood)}"></div>
            </div>
          {/if}
        </div>
      </button>
    {/each}
  {/if}
</div>

<style>
  .dock {
    display: flex; align-items: stretch; gap: 8px;
    height: 100%; padding: 8px 12px; overflow-x: auto; overflow-y: hidden;
  }

  .card {
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    width: 156px; padding: 8px 10px;
    background: #1a1820; border: 1px solid #2e2a3a; border-radius: 8px;
    cursor: pointer; text-align: left; color: inherit;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: #5b4fcf; }
  .card.selected { border-color: #7b6fe8; background: #1e1c2e; }
  .card.gone { opacity: 0.55; }

  .portrait {
    width: 32px; height: 32px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-weight: bold;
    font-size: 14px; color: #fff; flex-shrink: 0;
    object-fit: cover;
  }
  .portrait.desaturated { filter: grayscale(0.8); }

  .card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .name {
    font-size: 12px; font-weight: 600; color: #e0d8cc;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .strikethrough { text-decoration: line-through; color: #888; }
  .italic { font-style: italic; color: #999; }

  .state-badge {
    font-size: 9px; padding: 1px 5px; border-radius: 4px;
    font-weight: 600; white-space: nowrap; align-self: flex-start;
  }
  .state-idle    { background: #1a3a1a; color: #4caf50; }
  .state-quest   { background: #3a2a00; color: #ff9800; }
  .state-rest    { background: #0a1f3a; color: #42a5f5; }
  .state-social  { background: #0a2e2e; color: #26c6da; }
  .state-dispute { background: #2e1a00; color: #ff7043; }
  .state-dead    { background: #1a1a1a; color: #777; }
  .state-retired { background: #1e1e1e; color: #888; }

  .mood-bar-bg { height: 4px; background: #2e2a3a; border-radius: 2px; overflow: hidden; }
  .mood-bar-fill { height: 100%; transition: width 0.3s; border-radius: 2px; }

  .empty { color: #666; font-size: 13px; align-self: center; }
</style>
