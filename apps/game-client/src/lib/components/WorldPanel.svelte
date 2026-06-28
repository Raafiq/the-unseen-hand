<script lang="ts">
  import type { SimulationContext, DispatchCommand, WorldEventType } from '@ugs/core';

  interface Props {
    ctx: SimulationContext;
    onDispatch: (cmd: DispatchCommand) => boolean;
  }

  const { ctx, onDispatch }: Props = $props();

  const regions = $derived([...ctx.activeRegions.values()]);

  const EVENT_OPTIONS: Array<{ type: WorldEventType; label: string; description: string; cost: number }> = [
    { type: 'STORM',              label: 'Storm',              description: 'Reduces quest availability 50%', cost: 15 },
    { type: 'WINDFALL',           label: 'Windfall',           description: 'Increases quest rewards 50%',   cost: 20 },
    { type: 'MONSTER_SURGE',      label: 'Monster Surge',      description: 'Difficulty +2 temporarily',     cost: 20 },
    { type: 'PLAGUE',             label: 'Plague',             description: '+15% injury chance',            cost: 15 },
    { type: 'TRAVELLING_MERCHANT',label: 'Travelling Merchant',description: 'Bonus items available',         cost: 10 },
    { type: 'RUMOUR',             label: 'Rumour',             description: 'Draws adventurers to region',   cost: 5  },
  ];

  const UNLOCK_THRESHOLDS: Record<string, number> = {
    THORNVALE: 0,
    GRIMHOLT: 200,
    ASHWOOD: 500,
  };

  function difficultyShiftCost(current: number, target: number): number {
    return Math.abs(target - current) * 3;
  }

  function handleShiftDifficulty(regionId: string, delta: number) {
    const cost = Math.abs(delta) * 3;
    if (ctx.divineInfluence < cost) return;
    if (!confirm(`Shift difficulty by ${delta > 0 ? '+' : ''}${delta}? Costs ${cost} DI.`)) return;
    onDispatch({ type: 'SHIFT_DIFFICULTY', regionId, delta, diCost: cost });
  }

  function handleSeedEvent(regionId: string, eventType: WorldEventType, cost: number) {
    onDispatch({ type: 'SEED_EVENT', regionId, eventType, diCost: cost });
  }

  let expandedSeeder = $state<string | null>(null);
  let expandedQuests = $state<Set<string>>(new Set());

  function toggleQuestSection(regionId: string) {
    const next = new Set(expandedQuests);
    if (next.has(regionId)) next.delete(regionId);
    else next.add(regionId);
    expandedQuests = next;
  }

  function questsForRegion(regionId: string) {
    // Quests don't have regionId field yet; show all for now
    return [...ctx.questBoard.available, ...ctx.questBoard.active];
  }

  function advInitial(id: string): string {
    return ctx.adventurers.get(id)?.identity.name[0] ?? '?';
  }
</script>

<div class="world-panel">
  <h2>Regions</h2>

  {#each regions as region (region.id)}
    <div class="region-section" class:locked={!region.unlocked}>
      <div class="region-header">
        <span class="region-name">{region.id}</span>
        {#if region.unlocked}
          <span class="region-diff">Difficulty {region.difficulty}/10</span>
        {:else}
          <span class="locked-label">Locked</span>
        {/if}
      </div>

      {#if region.unlocked}
        <!-- Active world events -->
        <div class="world-events">
          {#if region.activeWorldEvents.length > 0}
            {#each region.activeWorldEvents as we (we.type)}
              <span class="event-tag">
                {we.type} · expires Day {Math.floor(we.expiresAt / 24)}
              </span>
            {/each}
          {:else}
            <span class="no-events">No active events.</span>
          {/if}
        </div>

        <!-- Difficulty controls -->
        <div class="diff-controls">
          <button
            class="diff-btn"
            disabled={region.difficulty <= 1 || ctx.divineInfluence < 3}
            onclick={() => handleShiftDifficulty(region.id, -1)}
          >−</button>
          <div class="diff-bar-bg">
            <div class="diff-bar-fill" style="width:{(region.difficulty / 10) * 100}%"></div>
          </div>
          <button
            class="diff-btn"
            disabled={region.difficulty >= 10 || ctx.divineInfluence < 3}
            onclick={() => handleShiftDifficulty(region.id, +1)}
          >+</button>
          <span class="diff-cost">3 DI / step</span>
        </div>

        <!-- Seed event -->
        <div class="seeder">
          <button class="seed-btn" onclick={() => expandedSeeder = expandedSeeder === region.id ? null : region.id}>
            Seed Event ▾
          </button>
          {#if expandedSeeder === region.id}
            <div class="event-picker">
              {#each EVENT_OPTIONS as opt (opt.type)}
                {@const alreadyActive = region.activeWorldEvents.some(e => e.type === opt.type)}
                {@const canAfford = ctx.divineInfluence >= opt.cost}
                <button
                  class="event-opt"
                  class:disabled={alreadyActive || !canAfford}
                  disabled={alreadyActive || !canAfford}
                  onclick={() => { handleSeedEvent(region.id, opt.type, opt.cost); expandedSeeder = null; }}
                >
                  <span class="event-opt-name">{opt.label}</span>
                  <span class="event-opt-desc">{opt.description}</span>
                  <span class="event-opt-cost">{opt.cost} DI</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Quest sub-section -->
        <div class="quest-sub">
          <button class="quest-toggle" onclick={() => toggleQuestSection(region.id)}>
            Quests ({ctx.questBoard.active.length} active, {ctx.questBoard.available.length} available)
            {expandedQuests.has(region.id) ? '▲' : '▼'}
          </button>
          {#if expandedQuests.has(region.id)}
            <table class="quest-table">
              <thead>
                <tr><th>Quest</th><th>Diff</th><th>Party</th><th>Status</th></tr>
              </thead>
              <tbody>
                {#each ctx.questBoard.active as q (q.id)}
                  <tr>
                    <td>{q.name}</td>
                    <td>{q.difficulty}</td>
                    <td class="party-initials">
                      {#each q.assignedParty ?? [] as id}
                        <span class="adv-init">{advInitial(id)}</span>
                      {/each}
                    </td>
                    <td><span class="badge-amber">Active</span></td>
                  </tr>
                {/each}
                {#each ctx.questBoard.available as q (q.id)}
                  <tr>
                    <td>{q.name}</td>
                    <td>{q.difficulty}</td>
                    <td>—</td>
                    <td><span class="badge-green">Available</span></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      {:else}
        <!-- Locked region -->
        {@const threshold = UNLOCK_THRESHOLDS[region.id] ?? 999}
        <p class="unlock-info">Unlocks at reputation {threshold}</p>
        <div class="rep-bar-bg">
          <div class="rep-bar-fill" style="width:{Math.min(100, (ctx.reputation / threshold) * 100)}%"></div>
        </div>
        <p class="rep-progress">{ctx.reputation} / {threshold}</p>
      {/if}
    </div>
  {/each}

  <!-- Guild reputation -->
  <div class="rep-section">
    <span class="rep-label">Guild Reputation</span>
    <span class="rep-value">{ctx.reputation}</span>
  </div>
</div>

<style>
  .world-panel { padding: 0; }
  h2 { font-size: 15px; margin-bottom: 12px; color: #c9b8ff; }

  .region-section {
    background: #1a1820; border: 1px solid #2e2a3a; border-radius: 8px;
    padding: 12px; margin-bottom: 10px;
  }
  .region-section.locked { opacity: 0.5; }

  .region-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .region-name { font-weight: 700; font-size: 14px; color: #c9b8ff; }
  .region-diff { font-size: 12px; color: #888; }
  .locked-label { font-size: 12px; color: #555; font-style: italic; }

  .world-events { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .event-tag { font-size: 11px; background: #2e1a00; color: #ff9800; padding: 2px 8px; border-radius: 4px; }
  .no-events { font-size: 11px; color: #555; }

  .diff-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .diff-btn {
    width: 24px; height: 24px; background: #2e2a3a; border: 1px solid #44405a;
    color: #ccc; cursor: pointer; border-radius: 4px; font-size: 14px;
  }
  .diff-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .diff-bar-bg { flex: 1; height: 6px; background: #2e2a3a; border-radius: 3px; overflow: hidden; }
  .diff-bar-fill { height: 100%; background: #ff7043; transition: width 0.3s; border-radius: 3px; }
  .diff-cost { font-size: 10px; color: #555; }

  .seeder { margin-bottom: 8px; }
  .seed-btn {
    font-size: 11px; padding: 4px 10px; background: #2e2a3a; border: 1px solid #44405a;
    color: #aaa; cursor: pointer; border-radius: 4px;
  }
  .seed-btn:hover { background: #3e3a4a; }

  .event-picker { margin-top: 4px; border: 1px solid #2e2a3a; border-radius: 6px; overflow: hidden; }
  .event-opt {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    background: #131218; border: none; border-bottom: 1px solid #2e2a3a;
    cursor: pointer; text-align: left; color: inherit; width: 100%;
  }
  .event-opt:last-child { border-bottom: none; }
  .event-opt:hover:not(.disabled) { background: #1e1c24; }
  .event-opt.disabled { opacity: 0.4; cursor: not-allowed; }
  .event-opt-name { font-size: 12px; font-weight: 600; min-width: 120px; }
  .event-opt-desc { font-size: 11px; color: #777; flex: 1; }
  .event-opt-cost { font-size: 11px; color: #ffd54f; flex-shrink: 0; }

  .quest-sub { margin-top: 8px; }
  .quest-toggle {
    font-size: 11px; padding: 4px 10px; background: #131218; border: 1px solid #2e2a3a;
    color: #888; cursor: pointer; border-radius: 4px; width: 100%; text-align: left;
  }
  .quest-toggle:hover { background: #1e1c24; }

  .quest-table { width: 100%; margin-top: 6px; font-size: 11px; border-collapse: collapse; }
  .quest-table th { color: #666; padding: 4px; border-bottom: 1px solid #2e2a3a; text-align: left; }
  .quest-table td { padding: 4px; border-bottom: 1px solid #1e1c24; color: #aaa; }

  .party-initials { display: flex; gap: 3px; }
  .adv-init {
    width: 18px; height: 18px; border-radius: 50%; background: #5b4fcf;
    color: #fff; font-size: 9px; display: inline-flex; align-items: center; justify-content: center;
  }

  .badge-amber { background: #3a2a00; color: #ff9800; padding: 1px 6px; border-radius: 3px; }
  .badge-green { background: #1a3a1a; color: #4caf50; padding: 1px 6px; border-radius: 3px; }

  .unlock-info { font-size: 12px; color: #777; margin-bottom: 6px; }
  .rep-bar-bg { height: 4px; background: #2e2a3a; border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
  .rep-bar-fill { height: 100%; background: #7b6fe8; transition: width 0.3s; border-radius: 2px; }
  .rep-progress { font-size: 11px; color: #555; }

  .rep-section {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 12px; background: #1a1820; border: 1px solid #2e2a3a;
    border-radius: 6px; margin-top: 4px;
  }
  .rep-label { font-size: 12px; color: #888; }
  .rep-value { font-size: 14px; font-weight: 700; color: #c9b8ff; }
</style>
