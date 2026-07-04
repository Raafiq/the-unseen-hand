<script lang="ts">
  import type { SimulationContext, TownRole, RelationshipType } from '@ugs/core';
  import { strengthToType, renderThought } from '@ugs/core';
  import { portraitSrc, portraitColor } from '../portraits';

  interface Props {
    ctx: SimulationContext;
    npcId: string;
    // Re-target the drawer to another actor (adventurer or notable NPC).
    onSelectActor: (id: string) => void;
    // 'panel' = tall single-column (sidebar); 'drawer' = wide multi-column (bottom drawer).
    variant?: 'panel' | 'drawer';
  }

  const { ctx, npcId, onSelectActor, variant = 'panel' }: Props = $props();

  const npc = $derived(ctx.notableNpcs.get(npcId));

  // Notable NPCs are graph nodes; edges are symmetric, so the NPC's own relationships
  // read straight out of the graph the same way an adventurer's do (npc-system.md).
  const sortedEdges = $derived(
    [...(npc ? (ctx.relationships.get(npcId) ?? new Map()) : new Map()).entries()]
      .filter(([, e]) => e.strength > -50 || strengthToType(e.strength) !== 'STRANGER')
      .sort(([, a], [, b]) => b.strength - a.strength)
  );

  const traitEntries = $derived(npc ? Object.entries(npc.traits) : []);
  // Pure on-demand render (thought-system.md: "the panel is a window, not a hand").
  const thought = $derived(renderThought(ctx, npcId));

  const ROLE_LABELS: Record<TownRole, string> = {
    GATE_GUARD:    'Gate Guard',
    SHOPKEEPER:    'Shopkeeper',
    URCHIN:        'Urchin',
    DRUNK:         'Drunk',
    PRIEST:        'Priest',
    MERCHANT:      'Merchant',
    BEGGAR:        'Beggar',
    BARD:          'Bard',
    STABLEHAND:    'Stablehand',
    BLACKSMITH:    'Blacksmith',
    GUARD_CAPTAIN: 'Guard Captain',
    INNKEEPER:     'Innkeeper',
  };

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

  // Resolve the other endpoint of an edge to a display name — adventurer or NPC.
  function actorName(id: string): string {
    return ctx.adventurers.get(id)?.identity.name ?? ctx.notableNpcs.get(id)?.name ?? id;
  }

</script>

{#if npc}
  {@const src = portraitSrc(npc.id, { role: npc.role })}
  <div class="detail" class:drawer={variant === 'drawer'}>
    <!-- Identity -->
    <div class="identity">
      {#if src}
        <img class="portrait-lg" {src} alt={npc.name} />
      {:else}
        <div class="portrait-lg" style="background:{portraitColor(npc.id)}">
          {npc.name[0]}
        </div>
      {/if}
      <div class="ident-body">
        <div class="ident-name">{npc.name}</div>
        <div class="role-badge">{ROLE_LABELS[npc.role] ?? npc.role}</div>
        <div class="townsfolk-tag">Townsfolk</div>
      </div>
    </div>

    <!-- Bio -->
    <div class="bio"><em>{npc.bio}</em></div>

    <!-- Traits -->
    {#if traitEntries.length > 0}
      <div class="section-label">Traits</div>
      <div class="axes">
        {#each traitEntries as [axis, val] (axis)}
          <div class="axis-row">
            <span class="axis-name">{axis}</span>
            <div class="axis-bar-bg">
              <div class="axis-bar-fill" style="width:{Math.round(val)}%"></div>
            </div>
            <span class="axis-val">{val}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Mood (live — day-tick decayed, encounter-written; npc-system.md interiority) -->
    <div class="section-label">Mood</div>
    <div class="mood-score">{Math.round(npc.mood)}/100</div>

    <!-- Want (static longing; npc-system.md) -->
    <div class="section-label">Wants</div>
    <div class="want">{npc.want.text}</div>

    <!-- Inner voice (thought-system.md) -->
    {#if thought}
      <div class="section-label">Inner voice</div>
      <div class="inner-voice">{thought.text}</div>
    {/if}

    <!-- Relationships -->
    {#if sortedEdges.length > 0}
      <div class="section-label">Relationships</div>
      {#each sortedEdges as [otherId, edge] (otherId)}
        {@const other = ctx.adventurers.get(otherId)}
        <div class="rel-row" role="button" tabindex="0"
          onclick={() => onSelectActor(otherId)}
          onkeydown={(e) => e.key === 'Enter' && onSelectActor(otherId)}>
          <span class="rel-name">
            {actorName(otherId)}
            {#if !other && ctx.notableNpcs.has(otherId)} <em>[townsfolk]</em>{/if}
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
  </div>
{:else}
  <div class="no-npc">Townsfolk not found.</div>
{/if}

<style>
  .detail { padding: 14px; display: flex; flex-direction: column; gap: 10px; }

  /* Drawer variant — flow into balanced columns to use the wide, short bottom
     drawer. Two columns (not three): a townsfolk has fewer sections than an
     adventurer, so three would read sparse. */
  .detail.drawer {
    display: block;
    column-count: 2;
    column-gap: 28px;
    padding: 16px 22px 18px;
  }
  .detail.drawer > * { margin: 0 0 10px; break-inside: avoid; }
  .detail.drawer .identity { column-span: all; margin-bottom: 12px; }
  .detail.drawer .bio { column-span: all; }
  .detail.drawer .section-label { break-after: avoid; }

  .identity { display: flex; gap: 10px; align-items: flex-start; }
  .portrait-lg {
    width: 48px; height: 48px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-size: 20px;
    font-weight: bold; color: #fff; flex-shrink: 0;
    object-fit: cover;
  }
  .ident-body { flex: 1; }
  .ident-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .role-badge {
    display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px;
    font-weight: 600; background: #2a1f3a; color: #c9b8ff;
  }
  .townsfolk-tag {
    display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px;
    font-weight: 600; background: #1e2a1e; color: #8fbf8f; margin-left: 4px;
  }

  .bio { font-size: 12px; color: #999; font-style: italic; }

  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-top: 4px; }

  .axes { display: flex; flex-direction: column; gap: 4px; }
  .axis-row { display: flex; align-items: center; gap: 6px; }
  .axis-name { font-size: 11px; color: #777; width: 60px; text-transform: capitalize; }
  .axis-bar-bg { flex: 1; height: 4px; background: #2e2a3a; border-radius: 2px; overflow: hidden; }
  .axis-bar-fill { height: 100%; background: #5b4fcf; transition: width 0.3s; border-radius: 2px; }
  .axis-val { font-size: 11px; color: #888; width: 28px; text-align: right; }

  .mood-score { font-size: 13px; font-weight: 600; color: #ccc; }
  .want { font-size: 12px; color: #b0a89a; line-height: 1.4; }
  .inner-voice { font-size: 12px; color: #a49cb4; font-style: italic; line-height: 1.5; }

  .rel-row {
    display: flex; align-items: center; gap: 8px; padding: 4px 0;
    border-bottom: 1px solid #1e1c24; cursor: pointer;
  }
  .rel-row:hover .rel-name { color: #c9b8ff; }
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

  .no-npc { padding: 20px; color: #666; font-size: 13px; }
</style>
