import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExternalHostQualificationAfterTests } from '../scripts/build-external-host-qualification-v1-receipt.mjs';

for (const failedPhase of ['focused', 'full']) {
  test(`qualification never constructs a receipt when ${failedPhase} tests fail`, async () => {
    const phases = [];
    let constructions = 0;
    await assert.rejects(buildExternalHostQualificationAfterTests({
      repository: 'unused-no-filesystem', sourceCommit: 'a'.repeat(40),
      runTestsImpl: async (files) => {
        const phase = files.length ? 'focused' : 'full';
        phases.push(phase);
        if (phase === failedPhase) throw new Error(`failed-${phase}`);
        return { status: 'pass', tests: 3 };
      },
      buildReceiptImpl: async () => { constructions++; },
    }), new RegExp(`failed-${failedPhase}`));
    assert.equal(constructions, 0);
    assert.deepEqual(phases, failedPhase === 'focused' ? ['focused'] : ['focused', 'full']);
  });
}

test('qualification constructs exactly once with separately observed test counts', async () => {
  const events = [];
  const receipt = await buildExternalHostQualificationAfterTests({
    repository: 'unused-no-filesystem', sourceCommit: 'a'.repeat(40),
    runTestsImpl: async (files, repository) => {
      assert.equal(repository, 'unused-no-filesystem');
      const phase = files.length ? 'focused' : 'full';
      events.push(phase);
      return { status: 'pass', tests: phase === 'focused' ? 3 : 17 };
    },
    buildReceiptImpl: async (input) => {
      events.push('build');
      assert.deepEqual(input.testRuns, {
        focused: { status: 'pass', tests: 3 }, full: { status: 'pass', tests: 17 },
      });
      assert.equal(input.repositoryRoot, 'unused-no-filesystem');
      assert.equal(input.sourceCommit, 'a'.repeat(40));
      return { receiptDigest: 'verified-by-builder' };
    },
  });
  assert.deepEqual(events, ['focused', 'full', 'build']);
  assert.equal(receipt.receiptDigest, 'verified-by-builder');
});
