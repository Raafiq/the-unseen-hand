<script lang="ts">
  import type { SimulationContext, Adventurer } from '@ugs/core';
  import { topMoodFactors, moodThresholdLabel } from '@ugs/core';

  const GOAL_ICONS: Record<string, string> = {
    HEROISM: '⚔', WEALTH: '💰', BELONGING: '🤝', REVENGE: '🗡',
    WANDERLUST: '🌍', PEACE: '☮',
  };

  interface Props {
    ctx: SimulationContext;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
  }

  const { ctx, selectedId, onSelect }: Props = $props();

  function portraitColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    return `hsl(${hue}, 50%, 40%)`;
  }

  const living = $derived(
    [...ctx.adventurers.values()]
      .filter(a => a.state !== 'DEAD' && a.state !== 'RETIRED')
      .sort((a, b) => a.identity.name.localeCompare(b.identity.name))
  );
  const dead = $derived(
    [...ctx.adventurers.values()].filter(a => a.state === 'DEAD')
  );
  const retired = $derived(
    [...ctx.adventurers.values()].filter(a => a.state === 'RETIRED')
  );
  const compact = $derived(ctx.adventurers.size > 12);

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

  function moodColor(mood: number) {
    return mood >= 50 ? '#4caf50' : mood >= 25 ? '#ff9800' : '#f44336';
  }

  function goalProgress(adv: Adventurer): number {
    const ms = adv.personalGoalProgress.milestones.length;
    const goal = adv.identity.personalGoal;
    const totals: Record<string, number> = {
      HEROISM: 4, WEALTH: 5, BELONGING: 2, REVENGE: 1, WANDERLUST: 3, PEACE: 1,
    };
    return Math.min(1, ms / (totals[goal] ?? 4));
  }

  function handleCardClick(adv: Adventurer) {
    onSelect(selectedId === adv.id ? null : adv.id);
  }
</script>

<div class="roster">
  {#if living.length > 0}
    <div class="section-header">Active</div>
    <div class="grid" class:compact>
      {#each living as adv (adv.id)}
        <button
          class="card"
          class:compact
          class:selected={adv.id === selectedId}
          onclick={() => handleCardClick(adv)}
        >
          <div class="portrait" style="background:{portraitColor(adv.id)}">
            {adv.identity.name[0]}
          </div>
          {#if !compact}
            <div class="card-body">
              <div class="card-top">
                <span class="name">{adv.identity.name}</span>
                <span class="state-badge {STATE_LABELS[adv.state]?.cls}">
                  {STATE_LABELS[adv.state]?.label ?? adv.state}
                </span>
              </div>
              <div class="mood-bar-bg">
                <div class="mood-bar-fill" style="width:{Math.round(adv.mood)}%;background:{moodColor(adv.mood)}"></div>
              </div>
              <div class="card-footer">
                <span class="goal-icon" title={adv.identity.personalGoal}>
                  {GOAL_ICONS[adv.identity.personalGoal] ?? '?'}
                  <span class="goal-dot" style="width:{Math.round(goalProgress(adv)*16)}px"></span>
                </span>
                <span class="mood-label" style="color:{moodColor(adv.mood)}">
                  {moodThresholdLabel(adv.mood)}
                </span>
              </div>
            </div>
          {:else}
            <span class="name compact-name">{adv.identity.name}</span>
            <span class="state-badge {STATE_LABELS[adv.state]?.cls} compact-badge">
              {STATE_LABELS[adv.state]?.label ?? adv.state}
            </span>
            <div class="mood-bar-bg compact-mood">
              <div class="mood-bar-fill" style="width:{Math.round(adv.mood)}%;background:{moodColor(adv.mood)}"></div>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if dead.length > 0}
    <div class="section-header fallen">Fallen</div>
    <div class="grid" class:compact>
      {#each dead as adv (adv.id)}
        <button
          class="card dead"
          class:compact
          class:selected={adv.id === selectedId}
          onclick={() => handleCardClick(adv)}
        >
          <div class="portrait desaturated" style="background:{portraitColor(adv.id)}">
            {adv.identity.name[0]}
          </div>
          {#if !compact}
            <div class="card-body">
              <div class="card-top">
                <span class="name strikethrough">{adv.identity.name}</span>
                <span class="state-badge {STATE_LABELS.DEAD.cls}">Fallen</span>
              </div>
            </div>
          {:else}
            <span class="name compact-name strikethrough">{adv.identity.name}</span>
            <span class="state-badge state-dead compact-badge">Fallen</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if retired.length > 0}
    <div class="section-header">Departed</div>
    <div class="grid" class:compact>
      {#each retired as adv (adv.id)}
        <button
          class="card retired"
          class:compact
          class:selected={adv.id === selectedId}
          onclick={() => handleCardClick(adv)}
        >
          <div class="portrait desaturated" style="background:{portraitColor(adv.id)}">
            {adv.identity.name[0]}
          </div>
          {#if !compact}
            <div class="card-body">
              <div class="card-top">
                <span class="name italic">{adv.identity.name}</span>
                <span class="state-badge {STATE_LABELS.RETIRED.cls}">Departed</span>
              </div>
            </div>
          {:else}
            <span class="name compact-name italic">{adv.identity.name}</span>
            <span class="state-badge state-retired compact-badge">Departed</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if ctx.adventurers.size === 0}
    <p class="empty">No adventurers yet.</p>
  {/if}
</div>

<style>
  .roster { padding: 0; }
  .section-header {
    font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
    color: #666; margin: 12px 0 6px; padding-left: 2px;
  }
  .section-header.fallen { color: #8b0000; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
  .grid.compact { grid-template-columns: 1fr; }

  .card {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px; background: #1a1820; border: 1px solid #2e2a3a;
    border-radius: 8px; cursor: pointer; text-align: left; width: 100%; color: inherit;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: #5b4fcf; }
  .card.selected { border-color: #7b6fe8; background: #1e1c2e; }
  .card.compact { flex-direction: row; align-items: center; padding: 6px 10px; }
  .card.dead, .card.retired { opacity: 0.6; }

  .portrait {
    width: 36px; height: 36px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-weight: bold;
    font-size: 15px; color: #fff; flex-shrink: 0;
  }
  .portrait.desaturated { filter: grayscale(0.8); }

  .card-body { flex: 1; min-width: 0; }
  .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin-bottom: 6px; }
  .name { font-size: 13px; font-weight: 600; color: #e0d8cc; }
  .strikethrough { text-decoration: line-through; color: #888; }
  .italic { font-style: italic; }

  .state-badge {
    font-size: 10px; padding: 2px 6px; border-radius: 4px;
    font-weight: 600; white-space: nowrap; flex-shrink: 0;
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

  .card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
  .goal-icon { font-size: 14px; display: flex; align-items: center; gap: 4px; }
  .goal-dot { height: 3px; background: #7b6fe8; border-radius: 2px; transition: width 0.3s; }
  .mood-label { font-size: 10px; }

  /* Compact layout */
  .compact-name { flex: 1; font-size: 12px; }
  .compact-badge { margin-left: auto; }
  .compact-mood { width: 60px; margin-left: 8px; }

  .empty { color: #666; font-size: 13px; padding: 20px 0; }
</style>
