<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Region, RegionId } from '@ugs/core';

  interface Props {
    regions: Region[];
    selectedRegionId: string | null;
    onSelectRegion: (id: RegionId | null) => void;
  }

  const { regions, selectedRegionId, onSelectRegion }: Props = $props();

  const CANVAS_W = 380;
  const CANVAS_H = 200;

  // Fixed region layout positions (absolute coords)
  const REGION_POSITIONS: Record<string, { x: number; y: number }> = {
    THORNVALE: { x: 100, y: 100 },
    GRIMHOLT:  { x: 220, y: 60  },
    ASHWOOD:   { x: 300, y: 140 },
  };

  // Guild home node
  const GUILD_POS = { x: 50, y: 160 };

  let canvasContainer = $state<HTMLDivElement | undefined>(undefined);
  let app: any = null;
  let loadFailed = $state(false);

  onMount(async () => {
    try {
      const { Application, Graphics, Text, TextStyle } = await import('pixi.js');
      const pixi = new Application();
      await pixi.init({
        width: CANVAS_W,
        height: CANVAS_H,
        backgroundColor: 0x0c0b16,
        antialias: true,
      });
      canvasContainer?.appendChild(pixi.canvas as HTMLCanvasElement);
      app = pixi;

      draw(pixi, Graphics, Text, TextStyle);
    } catch (err) {
      console.warn('[WorldMap] PixiJS init failed:', err);
      loadFailed = true;
    }
  });

  function draw(pixi: any, Graphics: any, Text: any, TextStyle: any) {
    pixi.stage.removeChildren();

    // Draw paths between connected regions
    const connections: [string, string][] = [
      ['THORNVALE', 'GRIMHOLT'],
      ['GRIMHOLT',  'ASHWOOD'],
    ];
    for (const [a, b] of connections) {
      const pa = REGION_POSITIONS[a];
      const pb = REGION_POSITIONS[b];
      if (!pa || !pb) continue;
      const line = new Graphics();
      line.moveTo(pa.x, pa.y).lineTo(pb.x, pb.y);
      line.stroke({ color: 0x2e2a3a, width: 1.5 });
      pixi.stage.addChild(line);
    }

    // Guild node
    const guildG = new Graphics();
    guildG.circle(0, 0, 10);
    guildG.fill(0x3a3060);
    guildG.x = GUILD_POS.x;
    guildG.y = GUILD_POS.y;
    pixi.stage.addChild(guildG);

    const guildLabel = new Text({ text: '⚑', style: new TextStyle({ fontSize: 11, fill: '#9575cd' }) });
    guildLabel.anchor.set(0.5);
    guildLabel.x = GUILD_POS.x;
    guildLabel.y = GUILD_POS.y;
    pixi.stage.addChild(guildLabel);

    // Region nodes
    for (const region of regions) {
      const pos = REGION_POSITIONS[region.id];
      if (!pos) continue;

      const isSelected = selectedRegionId === region.id;
      const color = region.unlocked ? (isSelected ? 0x7e57c2 : 0x4a3e6e) : 0x2a2830;
      const radius = 16;

      const circle = new Graphics();
      circle.circle(0, 0, radius);
      circle.fill(color);
      if (isSelected) {
        circle.circle(0, 0, radius + 3);
        circle.stroke({ color: 0x9575cd, width: 2 });
      }
      circle.x = pos.x;
      circle.y = pos.y;
      circle.interactive = true;
      circle.cursor = 'pointer';
      circle.on('pointerdown', () => {
        onSelectRegion(selectedRegionId === region.id ? null : region.id);
      });
      pixi.stage.addChild(circle);

      // Region name label
      const fill = region.unlocked ? '#c9b8ff' : '#555555';
      const label = new Text({ text: region.id[0] ?? '?', style: new TextStyle({
        fontSize: 12, fill, fontWeight: 'bold',
      })});
      label.anchor.set(0.5);
      label.x = pos.x;
      label.y = pos.y;
      label.interactive = false;
      pixi.stage.addChild(label);

      const nameLabel = new Text({ text: region.id, style: new TextStyle({
        fontSize: 9, fill: region.unlocked ? '#9080c0' : '#444',
      })});
      nameLabel.anchor.set(0.5, 0);
      nameLabel.x = pos.x;
      nameLabel.y = pos.y + radius + 3;
      pixi.stage.addChild(nameLabel);

      // World event indicator
      if (region.activeWorldEvents.length > 0) {
        const indicator = new Text({ text: '⚡', style: new TextStyle({ fontSize: 10, fill: '#ff9800' }) });
        indicator.x = pos.x + radius - 4;
        indicator.y = pos.y - radius - 10;
        pixi.stage.addChild(indicator);
      }
    }
  }

  // Redraw when selected region changes
  $effect(() => {
    if (!app) return;
    import('pixi.js').then(({ Graphics, Text, TextStyle }) => {
      draw(app, Graphics, Text, TextStyle);
    });
  });

  onDestroy(() => {
    app?.destroy(true);
  });
</script>

<div class="map-container">
  {#if loadFailed}
    <div class="map-fallback">
      <p>Map unavailable — use the region list below.</p>
    </div>
  {:else}
    <div bind:this={canvasContainer as any} class="map-canvas-host"></div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%; margin-bottom: 12px;
    border: 1px solid #2e2a3a; border-radius: 6px; overflow: hidden;
    background: #0c0b16;
  }
  .map-canvas-host { display: block; }
  .map-canvas-host :global(canvas) { display: block; }
  .map-fallback {
    padding: 16px; color: #555; font-size: 12px; text-align: center;
    height: 200px; display: flex; align-items: center; justify-content: center;
  }
</style>
