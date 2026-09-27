import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeOperatorRevocationEpoch, nativeOperatorTask, nativeOperatorError }
  from '../src/host/native-operator-binding-policy.mjs';

test('omitted epoch preserves the exact historical task wire shape', () => {
  assert.deepEqual(nativeOperatorTask({}, 'session-a'), {
    taskId: 'session-a', hostAdapterId: 'pi-sdk-v1', revocationEpoch: 0,
  });
});
for (const epoch of [0, 1, 2, 10, Number.MAX_SAFE_INTEGER]) {
  test(`explicit host epoch ${epoch} is retained, not incremented or inferred`, () => {
    const config = Object.freeze({ revocationEpoch: epoch });
    assert.equal(nativeOperatorRevocationEpoch(config), epoch);
    assert.deepEqual(nativeOperatorTask(config, 'session-b'), {
      taskId: 'session-b', hostAdapterId: 'pi-sdk-v1', revocationEpoch: epoch,
    });
    assert.deepEqual(config, { revocationEpoch: epoch });
  });
}
for (const [label, epoch] of Object.entries({
  negative: -1, negativeZero: -0, fraction: 0.5, unsafe: Number.MAX_SAFE_INTEGER + 1,
  infinity: Infinity, nan: NaN, text: '1', null: null, boolean: true,
  undefined: undefined, object: {}, array: [], bigint: 1n,
})) {
  test(`rejects ${label} epoch instead of coercing/defaulting`, () => {
    assert.throws(() => nativeOperatorTask({ revocationEpoch: epoch }, 'session'),
      { message: 'native-operator:revocation-epoch' });
  });
}
for (const config of [null, undefined, [], 1, 'config']) {
  test(`rejects non-object config ${String(config)}`, () => {
    assert.throws(() => nativeOperatorRevocationEpoch(config), { message: 'native-operator:shape' });
  });
}
test('inherited epoch cannot become an operator pin', () => {
  assert.equal(nativeOperatorRevocationEpoch(Object.create({ revocationEpoch: 7 })), 0);
});
test('changing epoch does not change session, host, or caller configuration', () => {
  const config = { revocationEpoch: 3, grant: { allowedTools: ['read'] }, mission: { objective: 'inspect' } };
  const before = structuredClone(config);
  assert.deepEqual(Object.keys(nativeOperatorTask(config, 'new-session')).sort(),
    ['hostAdapterId', 'revocationEpoch', 'taskId']);
  assert.deepEqual(config, before);
});
test('typed registry mismatch produces a fixed actionable category without its message', () => {
  const error = Object.assign(new Error('PRIVATE /host/path token=canary'), {
    name: 'CortexBindingRegistryError', code: 'revocation-epoch-mismatch',
  });
  assert.equal(nativeOperatorError(error), 'native-operator:revocation-epoch-mismatch');
});
for (const error of [
  { name: 'Error', code: 'revocation-epoch-mismatch', message: 'PRIVATE' },
  { name: 'CortexBindingRegistryError', code: 'unknown-canary', message: 'PRIVATE' },
  new Error('revocation epoch mismatch'), null, undefined,
]) {
  test('unknown or untyped errors remain screened', () => {
    assert.equal(nativeOperatorError(error), 'native-operator:operation-failed');
  });
}
for (const prefix of ['native-operator', 'native-pi', 'native-host', 'native-session-report', 'native-run-history', 'native-godskills']) {
  test(`preserves existing screened ${prefix} categories`, () => {
    assert.equal(nativeOperatorError(new Error(`${prefix}:config-mismatch`)), `${prefix}:config-mismatch`);
  });
}
for (const message of ['native-operator:secret/path', 'native-operator:secret\nvalue',
  'native-operator:', 'native-operator:' + 'x'.repeat(81), 'native-operator:UPPER']) {
  test('does not widen the legacy safe error alphabet', () => {
    assert.equal(nativeOperatorError(new Error(message)), 'native-operator:operation-failed');
  });
}
