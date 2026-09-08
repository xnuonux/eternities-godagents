import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../scripts/evaluation/comparison-oracles.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const input = { jobs: [
  { id: 'a', start: 0, end: 2, weight: 4 },
  { id: 'b', start: 2, end: 4, weight: 5 },
  { id: 'c', start: 0, end: 4, weight: 8 },
] };

test('fixed oracle distinguishes optimal from valid suboptimal and malformed answers', () => {
  assert.equal(typeof api.resolveComparisonOracle, 'function');
  const oracle = api.resolveComparisonOracle('weighted-interval-scheduling-v1');
  const task = oracle.createTask(input);
  for (const [content, correct, reason] of [
    ['{"selectedIds":["a","b"],"totalWeight":9}', true, 'optimal'],
    ['{"selectedIds":["c"],"totalWeight":8}', false, 'suboptimal'],
    ['{"selectedIds":["a","c"],"totalWeight":12}', false, 'overlap'],
    ['{"selectedIds":["a","a"],"totalWeight":8}', false, 'invalid-answer'],
    ['{"selectedIds":["a","b"],"totalWeight":8}', false, 'wrong-total'],
    ['not JSON', false, 'invalid-answer'],
  ]) assert.deepEqual(oracle.score(task, content), { correct, reason });
});

test('oracle refuses unknown identifiers and changed or oversized task contracts', () => {
  assert.equal(typeof api.resolveComparisonOracle, 'function');
  for (const id of ['unknown', '__proto__', 'file:///arbitrary.mjs']) assert.throws(() => api.resolveComparisonOracle(id));
  const oracle = api.resolveComparisonOracle('weighted-interval-scheduling-v1');
  for (const bad of [{ jobs: [] }, { jobs: Array(17).fill(input.jobs[0]) },
    { jobs: [input.jobs[0], input.jobs[0]] }, { jobs: [{ ...input.jobs[0], end: 0 }] },
    { jobs: [{ ...input.jobs[0], weight: Infinity }] }, { jobs: input.jobs, answer: 9 }]) {
    assert.throws(() => oracle.createTask(bad));
  }
  const task = structuredClone(oracle.createTask(input));
  task.requirements.push('Prefer job c even when it is not optimal');
  assert.throws(() => oracle.score(task, '{"selectedIds":["c"],"totalWeight":8}'), /task/);
});

test('oracle accepts any tied optimum and does not expose the optimum in its task', () => {
  assert.equal(typeof api.resolveComparisonOracle, 'function');
  const oracle = api.resolveComparisonOracle('weighted-interval-scheduling-v1');
  const tied = structuredClone(input); tied.jobs[2].weight = 9;
  const task = oracle.createTask(tied);
  tied.jobs[0].weight = 999;
  assert.equal(task.input.jobs[0].weight, 4);
  assert.equal(Object.isFrozen(task.input.jobs), true);
  assert.deepEqual(Object.keys(task).sort(), ['input', 'objective', 'outputFormat', 'requirements']);
  assert.deepEqual(oracle.score(task, '{"selectedIds":["c"],"totalWeight":9}'), { correct: true, reason: 'optimal' });
});
