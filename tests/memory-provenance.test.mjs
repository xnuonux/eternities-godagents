import assert from 'node:assert/strict';
import test from 'node:test';

import { IntegrityError } from '../src/core/errors.mjs';
import { admitMemory } from '../src/memory/admission.mjs';

const policy = { foreignHistoryPolicy: 'provenance-only' };

test('imported and inferred content cannot be admitted as lived history', () => {
  for (const sourceClass of ['imported', 'inferred']) {
    assert.throws(
      () => admitMemory({
        record: {
          memoryId: `memory-${sourceClass}`,
          sourceClass,
          sourceRef: `source-${sourceClass}`,
          perspective: 'lived',
          content: 'private source text that must not appear in an error',
        },
        policy,
      }),
      (error) => error instanceof IntegrityError
        && !error.message.includes('private source text'),
    );
  }
});

test('foreign testimony remains admissible with explicit provenance', () => {
  const admitted = admitMemory({
    record: {
      memoryId: 'memory-testimony',
      sourceClass: 'imported',
      sourceRef: 'archive-1',
      perspective: 'recorded-testimony',
      content: 'an imported source reported this event',
    },
    policy,
  });

  assert.equal(admitted.sourceClass, 'imported');
  assert.equal(admitted.perspective, 'recorded-testimony');
  assert.equal(admitted.contentDigest.length, 64);
  assert.equal(Object.isFrozen(admitted), true);
});

test('direct vessel observations may enter lived memory without changing provenance', () => {
  const admitted = admitMemory({
    record: {
      memoryId: 'memory-observation',
      sourceClass: 'lived-observation',
      sourceRef: 'observation-1',
      perspective: 'lived',
      content: 'the fixture counter was observed at one',
    },
    policy,
  });

  assert.equal(admitted.sourceClass, 'lived-observation');
  assert.equal(admitted.perspective, 'lived');
});
