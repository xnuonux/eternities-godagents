export const jobs = Object.freeze([
  { id: 'A', start: 0, end: 4, weight: 7 },
  { id: 'B', start: 1, end: 3, weight: 6 },
  { id: 'C', start: 3, end: 5, weight: 7 },
  { id: 'D', start: 4, end: 7, weight: 10 },
  { id: 'E', start: 5, end: 8, weight: 11 },
  { id: 'F', start: 6, end: 9, weight: 8 },
  { id: 'G', start: 8, end: 10, weight: 5 },
  { id: 'H', start: 9, end: 12, weight: 9 },
  { id: 'I', start: 10, end: 13, weight: 11 },
  { id: 'J', start: 12, end: 14, weight: 6 },
  { id: 'K', start: 13, end: 16, weight: 8 },
  { id: 'L', start: 0, end: 16, weight: 42 },
].map(Object.freeze));
export const objective = 'Select the maximum-total-weight compatible subset of the supplied jobs. Produce one scheduling result, without tools or external actions.';
export const taskText = `${objective} Intervals are half-open [start,end), so touching endpoints are compatible. Return a JSON object with exactly selectedIds (an array of distinct job IDs) and totalWeight (an integer). Any maximum-weight compatible subset is accepted. Put that JSON as the string in the outer response field content. Jobs: ${JSON.stringify(jobs)}`;

export function score(content, input = jobs) {
  let parsed;
  try { parsed = JSON.parse(content); } catch { return { correct: false, reason: 'invalid-json' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.keys(parsed).sort().join(',') !== 'selectedIds,totalWeight'
      || !Array.isArray(parsed.selectedIds) || !Number.isSafeInteger(parsed.totalWeight)
      || parsed.selectedIds.some((id) => typeof id !== 'string')
      || new Set(parsed.selectedIds).size !== parsed.selectedIds.length) return { correct: false, reason: 'invalid-schema' };
  const selected = parsed.selectedIds.map((id) => input.find((job) => job.id === id));
  if (selected.some((job) => !job)) return { correct: false, reason: 'unknown-job' };
  const compatible = (subset) => subset.every((a, i) => subset.slice(i + 1)
    .every((b) => a.end <= b.start || b.end <= a.start));
  if (!compatible(selected)) return { correct: false, reason: 'overlap' };
  const total = selected.reduce((sum, job) => sum + job.weight, 0);
  if (total !== parsed.totalWeight) return { correct: false, reason: 'wrong-total' };
  // Exhaustive subset enumeration is independent of model reasoning and any DP solution.
  let optimum = 0;
  for (let mask = 0; mask < 2 ** input.length; mask += 1) {
    const subset = input.filter((_, index) => mask & (1 << index));
    if (compatible(subset)) optimum = Math.max(optimum, subset.reduce((sum, job) => sum + job.weight, 0));
  }
  return { correct: total === optimum, reason: total === optimum ? 'optimal' : 'suboptimal', total, optimum };
}
