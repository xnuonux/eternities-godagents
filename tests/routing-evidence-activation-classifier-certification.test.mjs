import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicRoutingEvidenceActivationClassifierFixture,
  rebuildRoutingEvidenceActivationClassifierReceipt,
  verifyRoutingEvidenceActivationClassifierCertificationReceipt,
} from '../scripts/build-routing-evidence-activation-classifier-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'routing-evidence-activation-classifier-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'routing-evidence-activation-classifier-v1.json');

test('routing-evidence classifier fixture rebuilds exact classification and real activation evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicRoutingEvidenceActivationClassifierFixture(), checked);
  assert.equal(checked.godskills.cardCount, 22);
  assert.equal(checked.classifier.authorityExpanded, false);
  assert.equal(checked.direct.muse.taskClass, 'creative-generation');
  assert.equal(checked.direct.aegis.consequenceClass, 'critical');
  assert.equal(checked.direct.mixed.taskClass, 'general');
  assert.deepEqual(checked.integration.selectedCapabilityIds, ['eternities-muse']);
  assert.deepEqual(checked.integration.activationModes, ['review']);
  assert.equal(checked.assertions.missionProseIgnored, true);
  assert.equal(checked.assertions.modeChosenByClassifier, false);
});

test('routing-evidence classifier receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyRoutingEvidenceActivationClassifierCertificationReceipt(checked), checked);
  assert.deepEqual(await rebuildRoutingEvidenceActivationClassifierReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);

  const changed = structuredClone(checked);
  changed.fixture.classifier.reviewAvailable = false;
  assert.throws(
    () => verifyRoutingEvidenceActivationClassifierCertificationReceipt(changed),
    /classifier|descriptor|fixture|receipt/i,
  );
});
