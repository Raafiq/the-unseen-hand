import type { SimulationContext } from '../world/types.js';
import { emitEvent } from '../events/eventBus.js';

export function diTrickleSubscriber(ctx: SimulationContext, _delta: number): SimulationContext {
  if (ctx.worldTime.hour !== 0) return ctx;
  const next = Math.min(100, ctx.divineInfluence + 1);
  if (next === ctx.divineInfluence) return ctx;
  return emitEvent({ ...ctx, divineInfluence: next }, { kind: 'DIVINE', subtype: 'DI_GAINED', diDelta: 1 });
}

export function grantDI(ctx: SimulationContext, amount: number): SimulationContext {
  const clamped = Math.min(100, Math.max(0, ctx.divineInfluence + amount));
  const diDelta = clamped - ctx.divineInfluence;
  if (diDelta === 0) return ctx;
  return emitEvent({ ...ctx, divineInfluence: clamped }, { kind: 'DIVINE', subtype: 'DI_GAINED', diDelta });
}
