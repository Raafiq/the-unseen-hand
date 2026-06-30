<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { CombatBeat, AdventurerId, Adventurer } from '@ugs/core';
  import { renderBeat } from '@ugs/core';

  interface Props {
    questName: string;
    success: boolean;
    beats: CombatBeat[];
    adventurers: Map<AdventurerId, Adventurer>;
    onClose: () => void;
  }

  const { questName, success, beats, adventurers, onClose }: Props = $props();

  // ---------------------------------------------------------------------------
  // Playback state
  // ---------------------------------------------------------------------------

  let playing = $state(false);
  let speedMultiplier = $state<1 | 3>(1);
  let currentBeatIndex = $state(-1); // -1 = not started
  let renderedBeats = $state<string[]>([]);
  let pixiApp = $state<any>(null);

  const BASE_BEAT_MS = 1500;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function beatMs(): number {
    return BASE_BEAT_MS / speedMultiplier;
  }

  function scheduleNext() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (currentBeatIndex + 1 < beats.length) {
        currentBeatIndex += 1;
        const beat = beats[currentBeatIndex]!;
        const text = renderBeat(beat, adventurers);
        renderedBeats = [...renderedBeats, text];
        scheduleNext();
      } else {
        playing = false;
      }
    }, beatMs());
  }

  function play() {
    playing = true;
    scheduleNext();
  }

  function pause() {
    playing = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function togglePlay() {
    if (playing) { pause(); } else { play(); }
  }

  function toggleSpeed() {
    speedMultiplier = speedMultiplier === 1 ? 3 : 1;
  }

  // ---------------------------------------------------------------------------
  // PixiJS canvas
  // ---------------------------------------------------------------------------

  let canvasContainer: HTMLDivElement;

  // Party layout: left side = adventurers, right = enemies (represented abstractly)
  const CANVAS_W = 520;
  const CANVAS_H = 280;
  const PARTY_X = 110;
  const ENEMY_X = 410;
  const ICON_RADIUS = 18;

  const partyIds = $derived([...new Set(beats.map(b => b.actorId))]);

  function portraitHue(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return hash % 360;
  }

  onMount(async () => {
    try {
      const { Application, Graphics, Text, TextStyle } = await import('pixi.js');
      const app = new Application();
      await app.init({
        width: CANVAS_W,
        height: CANVAS_H,
        backgroundColor: 0x0f0d18,
        antialias: true,
      });
      canvasContainer.appendChild(app.canvas as HTMLCanvasElement);
      pixiApp = app;

      // Draw party icons
      partyIds.forEach((id, i) => {
        const y = CANVAS_H * (i + 1) / (partyIds.length + 1);
        const adv = adventurers.get(id);
        const initial = adv?.identity.name?.[0] ?? '?';
        const hue = portraitHue(id);

        const circle = new Graphics();
        circle.circle(0, 0, ICON_RADIUS);
        circle.fill(`hsl(${hue}, 50%, 40%)`);
        circle.x = PARTY_X;
        circle.y = y;
        app.stage.addChild(circle);

        const label = new Text({ text: initial, style: new TextStyle({
          fontSize: 14, fill: '#ffffff', fontWeight: 'bold',
        })});
        label.anchor.set(0.5);
        label.x = PARTY_X;
        label.y = y;
        app.stage.addChild(label);
      });

      // Draw enemy cluster
      const enemyG = new Graphics();
      enemyG.circle(0, 0, ICON_RADIUS + 4);
      enemyG.fill(0x3a1a1a);
      enemyG.x = ENEMY_X;
      enemyG.y = CANVAS_H / 2;
      app.stage.addChild(enemyG);

      const enemyLabel = new Text({ text: '⚔', style: new TextStyle({
        fontSize: 16, fill: '#ef5350',
      })});
      enemyLabel.anchor.set(0.5);
      enemyLabel.x = ENEMY_X;
      enemyLabel.y = CANVAS_H / 2;
      app.stage.addChild(enemyLabel);

    } catch (err) {
      console.warn('[CombatReplay] PixiJS init failed — canvas degraded:', err);
    }
  });

  onDestroy(() => {
    pause();
    pixiApp?.destroy(true);
  });

  // Keyboard: Escape closes
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  // Scroll beat list to bottom as beats arrive
  let transcriptEl: HTMLDivElement;
  $effect(() => {
    if (renderedBeats.length && transcriptEl) {
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="overlay" role="dialog" aria-modal="true" aria-label="Combat Replay">
  <div class="modal">
    <div class="modal-header">
      <span class="quest-name">{questName}</span>
      <span class="outcome-label" class:success class:failure={!success}>
        {success ? 'Success' : 'Failure'}
      </span>
    </div>

    <div class="modal-body">
      <!-- PixiJS canvas -->
      <div class="canvas-area" bind:this={canvasContainer}>
        <!-- PixiJS canvas appended here; fallback text if WebGL unavailable -->
        {#if !pixiApp}
          <div class="canvas-fallback">Canvas unavailable</div>
        {/if}
      </div>

      <!-- Beat transcript -->
      <div class="transcript" bind:this={transcriptEl}>
        {#each renderedBeats as text, i (i)}
          <p class="beat-line">{text}</p>
        {/each}
        {#if renderedBeats.length === 0}
          <p class="transcript-hint">Press Play to begin the replay.</p>
        {/if}
      </div>
    </div>

    <div class="controls">
      <button class="ctrl-btn primary" onclick={togglePlay}>
        {playing ? 'Pause' : currentBeatIndex >= beats.length - 1 ? 'Done' : 'Play'}
      </button>
      <button class="ctrl-btn" onclick={toggleSpeed}>
        {speedMultiplier}×
      </button>
      <button class="ctrl-btn close-btn" onclick={onClose}>Close</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .modal {
    background: #13111e; border: 1px solid #2e2a3a; border-radius: 8px;
    width: 740px; max-width: 96vw; display: flex; flex-direction: column;
    max-height: 90vh;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid #2e2a3a;
  }
  .quest-name { font-size: 15px; font-weight: 600; color: #e0d8f0; }
  .outcome-label {
    font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 4px;
  }
  .success { background: #0a2e1a; color: #66bb6a; }
  .failure { background: #2e0a0a; color: #ef5350; }

  .modal-body {
    display: flex; gap: 12px; padding: 14px 18px; flex: 1; overflow: hidden;
  }
  .canvas-area {
    width: 520px; flex-shrink: 0; height: 280px; background: #0f0d18;
    border-radius: 4px; overflow: hidden; position: relative;
  }
  .canvas-fallback {
    position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; color: #555; font-size: 12px;
  }
  .transcript {
    flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
  }
  .beat-line {
    margin: 0; font-size: 12px; color: #c0b8d4; line-height: 1.5;
    padding: 4px 0; border-bottom: 1px solid #1e1c24;
  }
  .transcript-hint { color: #555; font-size: 12px; font-style: italic; margin: 0; }

  .controls {
    display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid #2e2a3a;
    justify-content: flex-end;
  }
  .ctrl-btn {
    padding: 6px 16px; border-radius: 4px; border: 1px solid #44405a;
    background: #1a1820; color: #bbb; cursor: pointer; font-size: 12px;
  }
  .ctrl-btn:hover { background: #2e2a3a; color: #fff; }
  .ctrl-btn.primary { background: #2e1a4e; border-color: #7e57c2; color: #ce93d8; }
  .ctrl-btn.primary:hover { background: #3d2060; }
  .ctrl-btn.close-btn { margin-left: auto; }
</style>
