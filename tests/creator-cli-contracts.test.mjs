import assert from 'node:assert/strict';
import test from 'node:test';

import { CreatorCliError, parseCreatorCliArgs } from '../src/creator/cli-contracts.mjs';

const library = [
  '--policy', 'C:/library/policy.json',
  '--policy-digest', 'a'.repeat(64),
  '--modules', 'C:/library/modules',
  '--expressions', 'C:/library/expressions',
  '--presets', 'C:/library/presets',
];

test('creator CLI parser accepts only exact command-specific options', () => {
  assert.deepEqual(parseCreatorCliArgs(['catalog', ...library]), {
    command: 'catalog',
    options: {
      policy: 'C:/library/policy.json',
      policyDigest: 'a'.repeat(64),
      modules: 'C:/library/modules',
      expressions: 'C:/library/expressions',
      presets: 'C:/library/presets',
    },
  });
  assert.equal(parseCreatorCliArgs([
    'preview-preset', ...library,
    '--preset', 'preset:aether-architect@1.0.0',
    '--creator', 'creator:dom',
  ]).command, 'preview-preset');
  assert.equal(parseCreatorCliArgs([
    'finalize-preset', ...library,
    '--preset', 'preset:aether-architect@1.0.0',
    '--creator', 'creator:dom',
    '--expected-preview-digest', 'b'.repeat(64),
    '--source-dir', 'C:/output/source',
    '--output-dir', 'C:/output/build',
  ]).command, 'finalize-preset');
});

test('unknown, duplicate, missing, empty, and command-inapplicable options fail closed', () => {
  const rows = [
    [],
    ['unknown', ...library],
    ['catalog', ...library, '--preset', 'preset:a@1'],
    ['catalog', ...library, '--policy', 'C:/other.json'],
    ['catalog', ...library.slice(0, -2)],
    ['catalog', ...library, '--modules'],
    ['catalog', ...library, '--modules', ''],
    ['catalog', ...library, 'orphan'],
  ];
  for (const argv of rows) {
    assert.throws(() => parseCreatorCliArgs(argv), CreatorCliError);
  }
});

test('parser failures never echo rejected values', () => {
  const canary = 'super-secret-canary-value';
  for (const argv of [
    ['catalog', ...library, '--api-key', canary],
    ['catalog', ...library, '--unknown', canary],
    ['preview-preset', ...library, '--preset', canary],
  ]) {
    try {
      parseCreatorCliArgs(argv);
      assert.fail('expected parser rejection');
    } catch (error) {
      assert.equal(error instanceof CreatorCliError, true);
      assert.doesNotMatch(error.message, new RegExp(canary));
      assert.doesNotMatch(error.code, new RegExp(canary));
    }
  }
});
