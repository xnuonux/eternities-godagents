import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/core/canonical-json.mjs';
const subject = await import('../scripts/evaluation/comparison-task.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const task = () => ({ objective: 'Choose a compatible schedule', input: { jobs: [] },
  requirements: ['Return distinct job identifiers'], outputFormat: 'JSON selectedIds and totalWeight' });

test('comparison task uses one canonical subject for both arms and retains its independent input', () => {
  assert.equal(typeof subject.bindComparisonTask, 'function');
  const input = task();
  const text = canonicalJson(input);
  const bound = subject.bindComparisonTask({ task: input, baselineSubject: text, godagentObjective: text });
  assert.equal(bound.subjectText, text);
  assert.deepEqual(bound.task, input);
  input.input.jobs.push({ id: 'changed' });
  assert.deepEqual(bound.task.input.jobs, []);
  assert.equal(Object.isFrozen(bound.task.input.jobs), true);
});

test('independently changed arm text cannot claim the frozen task binding', () => {
  assert.equal(typeof subject.bindComparisonTask, 'function');
  const input = task(); const text = canonicalJson(input);
  for (const changed of [text + ' extra requirement', JSON.stringify(input, null, 2), '']) {
    assert.throws(() => subject.bindComparisonTask({ task: input, baselineSubject: changed, godagentObjective: text }));
    assert.throws(() => subject.bindComparisonTask({ task: input, baselineSubject: text, godagentObjective: changed }));
  }
});

test('task binding rejects loose fields, ambiguous requirements and unbounded inputs', () => {
  assert.equal(typeof subject.bindComparisonTask, 'function');
  for (const mutate of [t => { t.extra = true; }, t => { t.objective = ''; },
    t => { t.requirements = []; }, t => { t.requirements.push(t.requirements[0]); },
    t => { t.input = 'x'.repeat(65537); }, t => { t.input = undefined; },
    t => { t.input = { invalid: NaN }; }, t => { t.input = new Date(0); },
    t => { t.input = JSON.parse('{"__proto__":{"hidden":true}}'); }]) {
    const input = task(); mutate(input);
    const text = JSON.stringify(input);
    assert.throws(() => subject.bindComparisonTask({ task: input, baselineSubject: text, godagentObjective: text }), /^Error: comparison task /);
  }
});

test('array holes and extra properties cannot disappear during task canonicalization', () => {
  for (const input of [new Array(1), Object.assign(['visible'], { hidden: 'omitted' })]) {
    const value = { ...task(), input };
    const text = canonicalJson(value);
    assert.throws(() => subject.bindComparisonTask({ task: value, baselineSubject: text, godagentObjective: text }), /array/);
  }
});
