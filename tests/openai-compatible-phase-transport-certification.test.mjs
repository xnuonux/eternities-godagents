import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicOpenAICompatibleAdmittedHostFixture,
  rebuildSealedOpenAICompatiblePhaseTransportReceipt,
  verifySealedOpenAICompatiblePhaseTransportReceipt,
} from '../scripts/build-sealed-openai-compatible-phase-transport-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'sealed-openai-compatible-phase-transport-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'sealed-openai-compatible-phase-transport-v1.json');

test('sealed OpenAI-compatible phase transport fixture rebuilds exact concrete cognition evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicOpenAICompatibleAdmittedHostFixture(), checked);
  assert.equal(checked.assertions.exactProviderPolicyPinned, true);
  assert.equal(checked.assertions.identityPolicyPinsNativeDescriptor, true);
  assert.equal(checked.assertions.allCredentialsReachedOnlyHeaders, true);
  assert.deepEqual(checked.execution.phaseOrder, ['native', 'review', 'revision', 'review']);
  assert.equal(checked.assertions.fourDurablePhaseCompletions, true);
  assert.equal(checked.assertions.finalReviewAccepted, true);
  assert.equal(checked.assertions.exactTerminalReplay, true);
  assert.equal(checked.assertions.replayProviderCalls, 0);
  assert.equal(checked.assertions.replayRouteLaunches, 0);
  assert.equal(checked.assertions.replayActivationLaunches, 0);
  assert.equal(checked.assertions.secretLeaks, 0);
  assert.equal(checked.assertions.noRealmAuthorityExpansion, true);
});

test('sealed OpenAI-compatible phase transport receipt reproduces from its exact source commit', async (context) => {
  let text;
  try {
    text = await readFile(receiptPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      context.skip('release receipt has not been issued yet');
      return;
    }
    throw error;
  }
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(verifySealedOpenAICompatiblePhaseTransportReceipt(checked), checked);
  assert.deepEqual(await rebuildSealedOpenAICompatiblePhaseTransportReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);

  const changed = structuredClone(checked);
  changed.metrics.providerCalls = 5;
  assert.throws(() => verifySealedOpenAICompatiblePhaseTransportReceipt(changed), /metrics|receipt/i);
});
