/**
 * SeededRNG — a deterministic pseudo-random number generator.
 *
 * Algorithm: xmur3 string hash → mulberry32 PRNG.
 * - Zero external dependencies.
 * - No Math.random(), no Date.now().
 * - Same seed → same sequence, always.
 *
 * Required by specs/principles.md#seeded-determinism:
 *   "All randomness flows through the SimulationContext RNG, which is seeded at
 *    world-gen. The same seed + the same command history must reproduce the same
 *    world, byte for byte."
 */
export class SeededRNG {
  private state: number;

  constructor(seed: string) {
    this.state = xmur3(seed);
  }

  /** Returns a float in [0, 1). */
  next(): number {
    return mulberry32(this) / 4294967296;
  }

  /** Returns an integer in [min, max] (inclusive on both ends). */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Internal state accessor for mulberry32 (package-private via module boundary). */
  _advance(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    return this.state;
  }
}

/**
 * xmur3 — maps a seed string to a 32-bit integer.
 * Source: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * mulberry32 — fast 32-bit PRNG step.
 * Source: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 *
 * Advances rng._state and returns the raw 32-bit output.
 */
function mulberry32(rng: SeededRNG): number {
  let z = rng._advance();
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return ((z ^ (z >>> 14)) >>> 0);
}
