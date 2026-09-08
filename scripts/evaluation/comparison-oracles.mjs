import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../src/core/canonical-json.mjs';

const id = 'weighted-interval-scheduling-v1';
const objective = 'Select a maximum-total-weight compatible subset of the supplied jobs.';
const requirements = [
  'Intervals are half-open [start,end); touching endpoints are compatible.',
  'Each selected ID must name one supplied job and occur at most once.',
  'totalWeight must equal the sum of the selected weights. Any tied optimum is accepted.',
];
const outputFormat = 'A JSON object with exactly selectedIds (an array of job IDs) and totalWeight (an integer), encoded as the string in the outer content field.';
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) throw new Error('oracle task shape invalid');
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function createTask(value) {
  const input = structuredClone(value);
  exact(input, ['jobs']);
  if (!Array.isArray(input.jobs) || input.jobs.length < 1 || input.jobs.length > 16
      || Object.keys(input.jobs).length !== input.jobs.length) throw new Error('oracle task job bound invalid');
  const seen = new Set();
  for (const job of input.jobs) {
    exact(job, ['id', 'start', 'end', 'weight']);
    if (typeof job.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(job.id) || seen.has(job.id)
        || ![job.start, job.end, job.weight].every(Number.isSafeInteger)
        || job.start < 0 || job.end > 1_000_000 || job.start >= job.end
        || job.weight < 0 || job.weight > 1_000_000) throw new Error('oracle task job invalid');
    seen.add(job.id);
  }
  return freeze({ objective, input, requirements: [...requirements], outputFormat });
}
function score(task, content) {
  const expected = createTask(task?.input);
  if (canonicalJson(task) !== canonicalJson(expected)) throw new Error('oracle task contract differs');
  const jobs = expected.input.jobs;
  const bad = reason => ({ correct: false, reason });
  if (typeof content !== 'string' || Buffer.byteLength(content) > 65_536) return bad('invalid-answer');
  let answer;
  try {
    answer = JSON.parse(content);
    exact(answer, ['selectedIds', 'totalWeight']);
  } catch { return bad('invalid-answer'); }
  if (!Array.isArray(answer.selectedIds) || answer.selectedIds.length > jobs.length
      || answer.selectedIds.some(value => typeof value !== 'string')
      || new Set(answer.selectedIds).size !== answer.selectedIds.length
      || !Number.isSafeInteger(answer.totalWeight)) return bad('invalid-answer');
  const selected = answer.selectedIds.map(value => jobs.find(job => job.id === value));
  if (selected.some(job => !job)) return bad('invalid-answer');
  const compatible = (a, b) => a.end <= b.start || b.end <= a.start;
  if (selected.some((job, index) => selected.slice(index + 1).some(other => !compatible(job, other)))) return bad('overlap');
  const total = selected.reduce((sum, job) => sum + job.weight, 0);
  if (total !== answer.totalWeight) return bad('wrong-total');
  // Exhaustive bounded subset search, independent of any model's algorithm.
  let optimum = 0;
  function search(index, chosen, weight) {
    if (index === jobs.length) { optimum = Math.max(optimum, weight); return; }
    search(index + 1, chosen, weight);
    if (chosen.every(job => compatible(job, jobs[index]))) search(index + 1, [...chosen, jobs[index]], weight + jobs[index].weight);
  }
  search(0, [], 0);
  return { correct: total === optimum, reason: total === optimum ? 'optimal' : 'suboptimal' };
}
const oracle = Object.freeze({ id, sourcePath: fileURLToPath(import.meta.url), createTask, score });

// Fixed repository-owned registry. No acquired modules, paths or callbacks are
// loaded from preregistration. Additional task families require reviewed code.
export function resolveComparisonOracle(requestedId) {
  if (requestedId !== id) throw new Error('unsupported comparison oracle');
  return oracle;
}
