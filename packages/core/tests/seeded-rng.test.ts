import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/world/SeededRNG.js';

describe('SeededRNG', () => {
  it('same seed produces identical number sequences across two independent instances', () => {
    const rng1 = new SeededRNG('test-seed-42');
    const rng2 = new SeededRNG('test-seed-42');

    const n = 20;
    const seq1 = Array.from({ length: n }, () => rng1.next());
    const seq2 = Array.from({ length: n }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different sequences', () => {
    const rngA = new SeededRNG('seed-alpha');
    const rngB = new SeededRNG('seed-beta');

    const seqA = Array.from({ length: 10 }, () => rngA.next());
    const seqB = Array.from({ length: 10 }, () => rngB.next());

    // Highly unlikely (1/2^320) to be equal if seeds differ
    expect(seqA).not.toEqual(seqB);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = new SeededRNG('bounds-check');
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(min, max) returns integers in [min, max]', () => {
    const rng = new SeededRNG('int-check');
    for (let i = 0; i < 100; i++) {
      const v = rng.nextInt(1, 10);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
