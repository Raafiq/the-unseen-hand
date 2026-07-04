# Principles

The project's philosophy, written down as decisive rules. Each picks a side of a real trade-off so an implementer can resolve an unspecified case the way the author would.

---

## Emergence over control

The player never dictates outcomes — only nudges probability. Every system that could be implemented as "player selects result" must instead be implemented as "player shifts probability, world still rolls." This applies from combat beat resolution to relationship formation to scenario outcomes.

> **Why:** The game's core tension is the gap between what the player wants and what the world delivers. Collapsing that gap (outcome dictation) kills the experience. A 95% shift is still a 5% chance of heartbreak — and that 5% is the story.

---

## Autonomy of outcomes; player-controlled tempo

The player never has to *resolve* anything for the world to make sense. No system may stall, require a player action, or produce degenerate state because the player did not choose an outcome — autonomous defaults cover every in-cycle decision, and any unaddressed decision moment resolves itself (see `behaviors/decision-moments.md`). What the player *does* control is **tempo**: the world advances one cycle at a time and waits at each cycle boundary for a `PROCEED` command before beginning the next (see `behaviors/world-clock.md`). Within a cycle the world is fully autonomous; between cycles the player sets the pace.

> **Why:** The joy is absorbing a *completed* cycle — reading what befell each adventurer — not watching a firehose scroll past faster than anyone can read. The game is turn-paced (the Football Manager / Persona reading-first lineage) rather than real-time-with-pause (RimWorld / Crusader Kings). The distinction that must never erode: the pause is for *reading*, never for *deciding*. A player who reads nothing and proceeds immediately still gets a coherent world where every situation resolved on its own. Autonomy did not go away — it moved from tempo to outcomes.

> **History:** Through Phase 10 this principle read "Autonomy is the default; intervention is the exception — the world must run indefinitely without any player input; the feel of watching an autonomous world is the primary joy." The events cycle-redesign (2026-07-04) deliberately traded the real-time autonomous-world feel for a turn-paced reading experience. The engine's determinism, headless correctness, and self-resolving defaults are unchanged; only the *tempo model* — who decides when the next cycle begins — moved to the player.

---

## Every outcome has a narrative cause

Every event the player sees in the event feed must be traceable to the adventurer's personality, relationships, history, or prior decisions. Random outcomes without narrative context are noise. A death caused by `courage: 18` hesitating at a critical moment is a story; a death from a bare dice roll is not.

> **Why:** Attachment to adventurers is the emotional core. Players grieve Mira's death because they understood why it happened, not because Mira had high stats.

---

## DI bankruptcy is a valid (intended) player state

Systems must not prevent the player from spending all Divine Influence. Running out of DI should feel consequential and recoverable — not like an error state. The passive trickle is a floor, not a protection. UI should surface low DI clearly; it must not prevent actions until actually at 0.

> **Why:** The core tension ("letting the world breathe makes you more powerful") only works if over-spending is a real mistake with real cost. Safety rails that prevent it defang the mechanic.

---

## Probability shift, not outcome override

This is the implementation constraint form of [Emergence over control](#emergence-over-control). `applyDivineShift` returns a clamped float; the simulation still rolls against it. No function may accept DI and return a guaranteed outcome. Tests must assert the shifted probability, not the rolled result.

> **Why:** Outcome override is a different — easier — game. The RNG roll after the shift is what makes divine intervention feel like reaching into fate rather than rewriting it.

---

## Headless correctness first, visual representation second

All simulation logic must be fully correct and fully testable in `packages/core` with zero UI. No feature that exists only in the Svelte layer can be considered "implemented." The UI is a view over simulation state; it is never the source of truth.

> **Why:** The UI will change. The simulation must be stable enough to be tested, replayed, and eventually run server-side. Coupling correctness to the view makes both fragile.

---

## Seeded determinism

All randomness flows through the `SimulationContext` RNG, which is seeded at world-gen. The same seed + the same command history must reproduce the same world, byte for byte. No system may use `Math.random()` directly. This is not a nice-to-have — it is required for save/load, replay, and deterministic tests.

> **Why:** Without seeded determinism, save/load is impossible and tests are non-reproducible. The architecture cost is low; the payoff (testability, replayability) is high.

---

## Permadeath is the weight; DI is the cost

Death must be permanent unless the player spends DI to resist it. No automatic second-chance mechanic, no revival items, no soft deaths. The DI cost to prevent a death must scale with how certain the death outcome was — rescuing a 95%-certain death costs far more than nudging a coin flip. Saving everyone must be mechanically self-defeating.

> **Why:** If death has no weight, attachment has no stakes. If the player can easily prevent all deaths, the world becomes a optimization puzzle instead of a tragedy generator.

---

## The event feed is the game

Every meaningful simulation event must produce a typed event with a rendered narrative string. If something happened and the player cannot read about it in the event feed, it effectively did not happen. Template coverage is not optional — every `BeatAction`, `SocialOutcome`, and `LifecycleEvent` must have at least 3 template variants that serve as fallbacks when LLM generation is unavailable.

> **Why:** The event feed is the primary interface with the world. For social events, LLM-generated text is the primary narrative layer (see `behaviors/social-system.md`); templates are the graceful fallback. For non-social events (combat beats, lifecycle events), templates remain the load-bearing layer. Either way: if it happened and it isn't in the feed, it didn't happen.
