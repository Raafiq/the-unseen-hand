const MAX_SHIFT = 0.40;
const MAX_DISTANCE = 10;

export function narrativeDistance(naturalProbability: number, targetProbability: number): number {
  if (naturalProbability === 0) return MAX_DISTANCE;
  const raw = Math.abs(targetProbability - naturalProbability) / naturalProbability;
  return Math.min(MAX_DISTANCE, raw);
}

export function applyDivineShift(baseProbability: number, diSpent: number): number {
  const shift = (diSpent / 100) * MAX_SHIFT;
  return Math.min(1, Math.max(0, baseProbability + shift));
}
