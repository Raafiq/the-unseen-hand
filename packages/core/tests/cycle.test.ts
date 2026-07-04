import { describe, it, expect } from 'vitest';
import { cycleOf } from '../src/world/WorldTime.js';

describe('cycleOf', () => {
  it('maps hours to the three cycles at the 8-tick boundaries', () => {
    expect(cycleOf(0)).toBe('MORNING');
    expect(cycleOf(7)).toBe('MORNING');
    expect(cycleOf(8)).toBe('AFTERNOON');
    expect(cycleOf(15)).toBe('AFTERNOON');
    expect(cycleOf(16)).toBe('NIGHT');
    expect(cycleOf(23)).toBe('NIGHT');
  });
});
