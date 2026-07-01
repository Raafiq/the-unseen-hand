<script lang="ts">
  import type { SimulationContext, Adventurer, DispatchCommand, HistoryEvent, RelationshipType, AdventurerState, ActivityId, PersonalGoal } from '@ugs/core';
  import { topMoodFactors, moodThresholdLabel, strengthToType } from '@ugs/core';

  type DivineEffect = 'COURAGE_BLESS' | 'LUCK_CURSE' | 'MOOD_LIFT' | 'SEND_DREAM' | 'REVEAL_SECRET' | 'MARK_FOR_DEATH';

  interface Props {
    ctx: SimulationContext;
    adventurerId: string;
    onSelectAdventurer: (id: string) => void;
    onDispatch: (cmd: DispatchCommand) => boolean;
  }

  const { ctx, adventurerId, onSelectAdventurer, onDispatch }: Props = $props();

  const adv = $derived(ctx.adventurers.get(adventurerId));
  const edges = $derived(adv ? [...(ctx.relationships.get(adv.id) ?? new Map()).entries()] : []);

  const sortedEdges = $derived(
    [...edges]
      .filter(([, e]) => e.strength > -50 || strengthToType(e.strength) !== 'STRANGER')
      .sort(([, a], [, b]) => b.strength - a.strength)
  );

  const moodFactors = $derived(adv ? topMoodFactors(adv.moodFactors, 3) : []);
  const recentHistory = $derived((adv?.history ?? []).slice(-10).reverse());

  const ADV_STATE_LABELS: Record<AdventurerState, string> = {
    IDLE:        'Idle',
    ON_QUEST:    'On Quest',
    IN_DUNGEON:  'In Dungeon',
    RESTING:     'Resting',
    SOCIALIZING: 'Socializing',
    IN_DISPUTE:  'In Dispute',
    DEAD:        'Fallen',
    RETIRED:     'Departed',
  };

  const GOAL_NAMES: Record<PersonalGoal, string> = {
    HEROISM:    'Heroism',
    WEALTH:     'Wealth',
    BELONGING:  'Belonging',
    REVENGE:    'Revenge',
    WANDERLUST: 'Wanderlust',
    PEACE:      'Peace',
  };

  const GOAL_DESCRIPTIONS: Record<PersonalGoal, string> = {
    HEROISM:    'Seeks glory and legend',
    WEALTH:     'Hunts fortune above all',
    BELONGING:  'Wants to find their people',
    REVENGE:    'Lives for a reckoning',
    WANDERLUST: 'Must see every horizon',
    PEACE:      'Wants the fighting to stop',
  };

  const ACTIVITY_LABELS: Record<ActivityId, string> = {
    TRAINING: 'Training', SPARRING: 'Sparring', PATROL: 'Patrol', HUNTING: 'Hunting',
    DRINKING: 'Drinking', GAMBLING: 'Gambling', COOKING: 'Cooking', EATING: 'Eating',
    GOSSIPING: 'Gossiping', READING: 'Reading', BROODING: 'Brooding', RESTING: 'Resting',
    PRAYING: 'Praying', CRAFTING: 'Crafting', SLEEPING: 'Sleeping',
  };

  const GOAL_TOTALS: Record<string, number> = {
    HEROISM: 4, WEALTH: 5, BELONGING: 2, REVENGE: 1, WANDERLUST: 3, PEACE: 1,
  };

  function portraitColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 50%, 40%)`;
  }

  function moodColor(mood: number) {
    return mood >= 50 ? '#4caf50' : mood >= 25 ? '#ff9800' : '#f44336';
  }

  const REL_LABELS: Record<RelationshipType, string> = {
    STRANGER: 'Stranger',
    ACQUAINTANCE: 'Acquaintance',
    FRIEND: 'Friend',
    TRUSTED_COMPANION: 'Trusted Companion',
    RIVAL: 'Rival',
    ENEMY: 'Enemy',
  };

  const REL_CLASSES: Record<RelationshipType, string> = {
    STRANGER: 'rel-stranger',
    ACQUAINTANCE: 'rel-acquaint',
    FRIEND: 'rel-friend',
    TRUSTED_COMPANION: 'rel-trusted',
    RIVAL: 'rel-rival',
    ENEMY: 'rel-enemy',
  };

  function edgeTypeName(strength: number): string {
    return REL_LABELS[strengthToType(strength)];
  }

  function edgeTypeClass(strength: number): string {
    return REL_CLASSES[strengthToType(strength)];
  }

  function historyLabel(h: HistoryEvent): string {
    const day = Math.floor(h.tick / 24);
    const names = h.involvedIds.map(id => ctx.adventurers.get(id)?.identity.name ?? id).join(', ');
    switch (h.kind) {
      case 'WITNESSED_DEATH': return `Day ${day}: Witnessed ${names ? names + "'s death" : 'a death'}.`;
      case 'SAVED_BY':        return `Day ${day}: Saved by ${names || 'an ally'}.`;
      case 'FIRST_KILL':      return `Day ${day}: First blood — came out on top.`;
      case 'NEAR_DEATH':      return `Day ${day}: Nearly died — but survived.`;
      case 'LUCK_CURSE':      return `Day ${day}: Touched by ill fortune.`;
      case 'MARK_FOR_DEATH':  return `Day ${day}: Marked — death's shadow lingers.`;
      case 'SEND_DREAM':      return `Day ${day}: Received divine guidance (dream).`;
      case 'QUEST_TRIUMPH':   return `Day ${day}: A decisive victory.`;
      case 'GOAL_ACHIEVED':   return `Day ${day}: Life goal achieved.`;
      case 'BETRAYED_BY':     return `Day ${day}: Betrayed by ${names || 'an ally'}.`;
      default: return `Day ${day}: ${h.kind}`;
    }
  }

  const DIVINE_OPTIONS: Array<{ effect: DivineEffect; label: string; desc: string; cost: number; distance: string }> = [
    { effect: 'MOOD_LIFT',      label: 'Mood Lift',      desc: '+25 mood factor (decays)',            cost: 5,  distance: 'LOW' },
    { effect: 'COURAGE_BLESS',  label: 'Courage Bless',  desc: '+20 effective courage next quest',    cost: 8,  distance: 'LOW' },
    { effect: 'SEND_DREAM',     label: 'Send Dream',     desc: 'Vague divine message',                cost: 5,  distance: 'LOW' },
    { effect: 'LUCK_CURSE',     label: 'Luck Curse',     desc: '−30% next quest success',             cost: 10, distance: 'MODERATE' },
    { effect: 'REVEAL_SECRET',  label: 'Reveal Secret',  desc: 'Forces BREAKTHROUGH with acquaintance',cost: 12, distance: 'MODERATE' },
    { effect: 'MARK_FOR_DEATH', label: 'Mark for Death', desc: '+40% death roll next quest',          cost: 15, distance: 'EXTREME' },
  ];

  function isOnCooldown(effect: DivineEffect): boolean {
    if (!adv) return false;
    if (effect === 'LUCK_CURSE' || effect === 'MARK_FOR_DEATH') {
      return adv.history.some(
        h => h.kind === effect && ctx.worldTime.tick - h.tick < 168,
      );
    }
    return false;
  }

  let confirmingEffect = $state<DivineEffect | null>(null);

  function handleDivineClick(effect: DivineEffect, cost: number) {
    confirmingEffect = effect;
  }

  function confirmDivine(effect: DivineEffect, cost: number) {
    if (!adv) return;
    onDispatch({ type: 'DIVINE_TOUCH', adventurerId: adv.id, effect, diCost: cost });
    confirmingEffect = null;
  }

  let backstoryExpanded = $state(false);

  function goalProgressFraction(a: Adventurer): number {
    const ms = a.personalGoalProgress.milestones.length;
    const total = GOAL_TOTALS[a.identity.personalGoal] ?? 4;
    return Math.min(1, ms / total);
  }
</script>

{#if adv}
  <div class="detail">
    <!-- Identity -->
    <div class="identity">
      <div class="portrait-lg" style="background:{portraitColor(adv.id)}">
        {adv.identity.name[0]}
      </div>
      <div class="ident-body">
        <div class="ident-name">{adv.identity.name}, age {adv.identity.age}</div>
        <div class="state-badge state-{adv.state.toLowerCase().replace('_','-')}">{ADV_STATE_LABELS[adv.state] ?? adv.state}</div>
        {#if adv.activityState && (adv.state === 'IDLE' || adv.state === 'RESTING' || adv.state === 'SOCIALIZING')}
          <div class="activity-pill">{ACTIVITY_LABELS[adv.activityState.current] ?? adv.activityState.current}</div>
        {/if}
      </div>
    </div>

    <!-- Backstory -->
    <div class="backstory">
      {#if backstoryExpanded || adv.identity.backstory.length <= 120}
        <em>{adv.identity.backstory}</em>
      {:else}
        <em>{adv.identity.backstory.slice(0, 120)}…</em>
        <button class="expand-btn" onclick={() => backstoryExpanded = true}>expand</button>
      {/if}
    </div>

    <!-- Goal -->
    <div class="goal-row">
      <span class="goal-name">{GOAL_NAMES[adv.identity.personalGoal] ?? adv.identity.personalGoal}</span>
      <span class="goal-desc">{GOAL_DESCRIPTIONS[adv.identity.personalGoal] ?? ''}</span>
      <div class="goal-bar-bg">
        <div class="goal-bar-fill" style="width:{Math.round(goalProgressFraction(adv)*100)}%"></div>
      </div>
    </div>

    <!-- Personality -->
    <div class="section-label">Personality</div>
    <div class="axes">
      {#each Object.entries(adv.personality) as [axis, val] (axis)}
        <div class="axis-row">
          <span class="axis-name">{axis}</span>
          <div class="axis-bar-bg">
            <div class="axis-bar-fill" style="width:{Math.round(val)}%"></div>
          </div>
          <span class="axis-val">{val}</span>
        </div>
      {/each}
    </div>

    <!-- Mood -->
    <div class="section-label">Mood</div>
    <div class="mood-score" style="color:{moodColor(adv.mood)}">
      {Math.round(adv.mood)}/100 — {moodThresholdLabel(adv.mood)}
    </div>
    {#each moodFactors as factor (factor.id)}
      <div class="mood-factor" style="color:{factor.value >= 0 ? '#4caf50' : '#f44336'}">
        {factor.label}: {factor.value > 0 ? '+' : ''}{Math.round(factor.value)}
      </div>
    {/each}

    <!-- Relationships -->
    {#if sortedEdges.length > 0}
      <div class="section-label">Relationships</div>
      {#each sortedEdges as [otherId, edge] (otherId)}
        {@const other = ctx.adventurers.get(otherId)}
        {@const npc = ctx.notableNpcs.get(otherId)}
        <div class="rel-row" class:rel-npc-row={!!npc} role="button" tabindex="0"
          onclick={() => other && onSelectAdventurer(otherId)}
          onkeydown={(e) => e.key === 'Enter' && other && onSelectAdventurer(otherId)}>
          <span class="rel-name">
            {other?.identity.name ?? npc?.name ?? otherId}
            {#if npc} <em>[townsfolk]</em>{/if}
            {#if other?.state === 'DEAD'} <em>[deceased]</em>{/if}
            {#if other?.state === 'RETIRED'} <em>[departed]</em>{/if}
          </span>
          <span class="rel-type {edgeTypeClass(edge.strength)}">{edgeTypeName(edge.strength)}</span>
          <div class="str-bar-bg">
            <div class="str-bar-fill"
              style="width:{Math.round(Math.abs(edge.strength))}%;background:{edge.strength >= 0 ? '#42a5f5' : '#ef5350'};margin-left:{edge.strength < 0 ? (100 - Math.round(Math.abs(edge.strength))) + '%' : '0'}"></div>
          </div>
        </div>
      {/each}
    {/if}

    <!-- History -->
    {#if recentHistory.length > 0}
      <div class="section-label">History</div>
      {#each recentHistory as h (h.tick + h.kind)}
        <div class="history-row">{historyLabel(h)}</div>
      {/each}
    {/if}

    <!-- Divine Touch -->
    {#if adv.state !== 'DEAD' && adv.state !== 'RETIRED'}
      <div class="section-label">Divine Touch</div>
      {#each DIVINE_OPTIONS as opt (opt.effect)}
        {@const cooldown = isOnCooldown(opt.effect)}
        {@const canAfford = ctx.divineInfluence >= opt.cost}
        {#if confirmingEffect === opt.effect}
          <div class="confirm-box">
            <p>Spend {opt.cost} DI to {opt.desc}? This cannot be undone.</p>
            <div class="confirm-btns">
              <button class="btn-confirm" onclick={() => confirmDivine(opt.effect, opt.cost)}>Confirm</button>
              <button class="btn-cancel" onclick={() => confirmingEffect = null}>Cancel</button>
            </div>
          </div>
        {:else}
          <button
            class="divine-opt"
            class:unaffordable={!canAfford || cooldown}
            disabled={!canAfford || cooldown}
            onclick={() => handleDivineClick(opt.effect, opt.cost)}
          >
            <div class="divine-top">
              <span class="divine-label">{opt.label}</span>
              <span class="divine-cost">{opt.cost} DI</span>
            </div>
            <span class="divine-desc">{cooldown ? '(on cooldown)' : opt.desc}</span>
            <span class="distance-tag distance-{opt.distance.toLowerCase()}">{opt.distance}</span>
          </button>
        {/if}
      {/each}
    {/if}
  </div>
{:else}
  <div class="no-adv">Adventurer not found.</div>
{/if}

<style>
  .detail { padding: 14px; display: flex; flex-direction: column; gap: 10px; }

  .identity { display: flex; gap: 10px; align-items: flex-start; }
  .portrait-lg {
    width: 48px; height: 48px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-size: 20px;
    font-weight: bold; color: #fff; flex-shrink: 0;
  }
  .ident-body { flex: 1; }
  .ident-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .state-badge {
    display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600;
  }
  .state-idle    { background: #1a3a1a; color: #4caf50; }
  .state-on-quest, .state-in-dungeon { background: #3a2a00; color: #ff9800; }
  .state-resting { background: #0a1f3a; color: #42a5f5; }
  .state-socializing { background: #0a2e2e; color: #26c6da; }
  .state-in-dispute { background: #2e1a00; color: #ff7043; }
  .state-dead    { background: #1a1a1a; color: #777; }
  .state-retired { background: #1e1e1e; color: #888; }

  .activity-pill {
    display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 3px;
    background: #1a2a1a; color: #7cb97c; margin-top: 3px; font-style: italic;
  }

  .backstory { font-size: 12px; color: #999; font-style: italic; }
  .expand-btn { background: none; border: none; color: #7b6fe8; cursor: pointer; font-size: 11px; }

  .goal-row { display: flex; flex-direction: column; gap: 3px; }
  .goal-name { font-size: 12px; font-weight: 700; color: #c9b8ff; }
  .goal-desc { font-size: 11px; color: #888; font-style: italic; }
  .goal-bar-bg { height: 3px; background: #2e2a3a; border-radius: 2px; overflow: hidden; }
  .goal-bar-fill { height: 100%; background: #7b6fe8; transition: width 0.3s; border-radius: 2px; }

  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-top: 4px; }

  .axes { display: flex; flex-direction: column; gap: 4px; }
  .axis-row { display: flex; align-items: center; gap: 6px; }
  .axis-name { font-size: 11px; color: #777; width: 60px; text-transform: capitalize; }
  .axis-bar-bg { flex: 1; height: 4px; background: #2e2a3a; border-radius: 2px; overflow: hidden; }
  .axis-bar-fill { height: 100%; background: #5b4fcf; transition: width 0.3s; border-radius: 2px; }
  .axis-val { font-size: 11px; color: #888; width: 28px; text-align: right; }

  .mood-score { font-size: 13px; font-weight: 600; }
  .mood-factor { font-size: 11px; padding-left: 4px; }

  .rel-row {
    display: flex; align-items: center; gap: 8px; padding: 4px 0;
    border-bottom: 1px solid #1e1c24; cursor: pointer;
  }
  .rel-row:hover .rel-name { color: #c9b8ff; }
  .rel-npc-row { cursor: default; }
  .rel-npc-row:hover .rel-name { color: #aaa; }
  .rel-name { flex: 1; font-size: 12px; color: #aaa; }
  .rel-name em { color: #555; font-size: 10px; }
  .rel-type { font-size: 10px; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
  .rel-stranger  { background: #1e1c24; color: #555; }
  .rel-acquaint  { background: #1e2e1e; color: #7cb97c; }
  .rel-friend    { background: #1a3a1a; color: #4caf50; }
  .rel-trusted   { background: #0a2240; color: #42a5f5; }
  .rel-rival     { background: #2e1a00; color: #ff7043; }
  .rel-enemy     { background: #2e0a0a; color: #ef5350; }
  .str-bar-bg { width: 50px; height: 4px; background: #2e2a3a; border-radius: 2px; overflow: hidden; position: relative; }
  .str-bar-fill { height: 100%; transition: width 0.3s; border-radius: 2px; position: absolute; }

  .history-row { font-size: 11px; color: #888; padding: 2px 0; border-bottom: 1px solid #1e1c24; }

  .divine-opt {
    padding: 8px 10px; background: #131218; border: 1px solid #2e2a3a;
    border-radius: 6px; cursor: pointer; text-align: left; color: inherit; width: 100%;
    display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px;
  }
  .divine-opt:hover:not(:disabled) { border-color: #5b4fcf; }
  .divine-opt.unaffordable { opacity: 0.45; cursor: not-allowed; }
  .divine-top { display: flex; justify-content: space-between; }
  .divine-label { font-size: 12px; font-weight: 700; color: #c9b8ff; }
  .divine-cost { font-size: 11px; color: #ffd54f; }
  .divine-desc { font-size: 11px; color: #999; }
  .distance-tag { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; align-self: flex-start; }
  .distance-low      { background: #1a3a1a; color: #4caf50; }
  .distance-moderate { background: #2e2200; color: #ffd54f; }
  .distance-extreme  { background: #2e0a0a; color: #ef5350; }

  .confirm-box {
    padding: 10px; background: #1e1c2e; border: 1px solid #5b4fcf; border-radius: 6px;
    margin-bottom: 4px;
  }
  .confirm-box p { font-size: 12px; color: #ccc; margin-bottom: 8px; }
  .confirm-btns { display: flex; gap: 6px; }
  .btn-confirm {
    padding: 4px 12px; background: #5b4fcf; border: none; color: #fff;
    border-radius: 4px; cursor: pointer; font-size: 12px;
  }
  .btn-cancel {
    padding: 4px 12px; background: #2e2a3a; border: 1px solid #44405a; color: #aaa;
    border-radius: 4px; cursor: pointer; font-size: 12px;
  }

  .no-adv { padding: 20px; color: #666; font-size: 13px; }
</style>
