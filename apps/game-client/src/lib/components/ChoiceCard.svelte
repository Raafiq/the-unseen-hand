<script lang="ts">
  import type { DecisionMoment } from '@ugs/core';

  interface Props {
    moments: DecisionMoment[];
    di: number;
    tick: number;
    onChoose: (decisionId: string, optionIndex: number) => void;
  }

  const { moments, di, tick, onChoose }: Props = $props();

  let primaryIdx = $state(0);

  const primary = $derived(moments[primaryIdx] ?? moments[0]);
  const secondary = $derived(moments.filter((_, i) => i !== primaryIdx));

  function expiryTicksLeft(moment: DecisionMoment): number {
    return Math.max(0, moment.expiresAt - tick);
  }

  function expiryClass(tl: number): string {
    return tl <= 3 ? 'expiry-red' : tl <= 12 ? 'expiry-amber' : 'expiry-normal';
  }

  function handleChoose(optionIndex: number) {
    if (!primary) return;
    onChoose(primary.id, optionIndex);
  }

  function promoteMoment(globalIdx: number) {
    primaryIdx = globalIdx;
  }
</script>

{#if primary}
  <div class="choice-panel">
    <!-- Primary card -->
    <div class="primary-card">
      <div class="situation-text">{primary.situationText}</div>
      <div class="expiry {expiryClass(expiryTicksLeft(primary))}">
        Expires in {expiryTicksLeft(primary)} ticks
      </div>

      <div class="options">
        {#each primary.options as option, i (i)}
          {@const canAfford = di >= option.diCost}
          <button
            class="option-btn"
            class:unaffordable={!canAfford}
            disabled={!canAfford}
            onclick={() => handleChoose(i)}
          >
            <div class="option-top">
              <span class="option-label">{option.label}</span>
              <span class="option-cost">{option.diCost === 0 ? 'Free' : `${option.diCost} DI`}</span>
            </div>
            <div class="option-desc">{option.description}</div>
            <span class="distance-tag distance-{option.narrativeDistanceLabel.toLowerCase()}">
              {option.narrativeDistanceLabel}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Secondary cards -->
    {#if secondary.length > 0}
      <div class="secondary-list">
        {#each secondary as moment, relIdx (moment.id)}
          {@const globalIdx = moments.indexOf(moment)}
          <button class="secondary-card" onclick={() => promoteMoment(globalIdx)}>
            <span class="secondary-text">
              {moment.situationText.slice(0, 60)}{moment.situationText.length > 60 ? '…' : ''}
            </span>
            <span class="secondary-expiry">{expiryTicksLeft(moment)}t</span>
            <span class="secondary-focus">Tap to focus</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .choice-panel { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

  .primary-card {
    background: #1e1c2e; border: 1px solid #5b4fcf; border-radius: 8px; padding: 14px;
  }

  .situation-text { font-size: 14px; font-weight: 700; color: #e0d8cc; line-height: 1.4; margin-bottom: 8px; }

  .expiry { font-size: 11px; margin-bottom: 12px; }
  .expiry-normal { color: #666; }
  .expiry-amber { color: #ff9800; }
  .expiry-red { color: #f44336; animation: pulse-text 1s infinite; }
  @keyframes pulse-text { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .options { display: flex; flex-direction: column; gap: 6px; }

  .option-btn {
    padding: 10px 12px; background: #131218; border: 1px solid #3e3a4e;
    border-radius: 6px; cursor: pointer; text-align: left; color: inherit;
    transition: border-color 0.15s;
  }
  .option-btn:hover:not(:disabled) { border-color: #7b6fe8; background: #1a1820; }
  .option-btn.unaffordable { opacity: 0.45; cursor: not-allowed; }

  .option-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .option-label { font-weight: 700; font-size: 12px; color: #c9b8ff; }
  .option-cost { font-size: 11px; color: #ffd54f; }
  .option-desc { font-size: 11px; color: #999; line-height: 1.4; margin-bottom: 4px; }

  .distance-tag { font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
  .distance-low      { background: #1a3a1a; color: #4caf50; }
  .distance-moderate { background: #2e2200; color: #ffd54f; }
  .distance-extreme  { background: #2e0a0a; color: #ef5350; }

  .secondary-list { display: flex; flex-direction: column; gap: 6px; }
  .secondary-card {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    background: #1a1820; border: 1px solid #2e2a3a; border-radius: 6px;
    cursor: pointer; text-align: left; color: inherit; font-size: 11px;
  }
  .secondary-card:hover { border-color: #5b4fcf; }
  .secondary-text { flex: 1; color: #999; }
  .secondary-expiry { color: #666; flex-shrink: 0; }
  .secondary-focus { color: #5b4fcf; flex-shrink: 0; font-size: 10px; }
</style>
