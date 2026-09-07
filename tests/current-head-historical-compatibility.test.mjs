import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { verifyCrossRepositoryCurrentHeadCertificateV2 } from '../src/integration/current-head-certificate.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const godskillsRoot = 'C:/dev/eternities-godskills';
const artifactPath = 'integrations/cross-repository-current-head-v2.json';
const snapshots = [
  {
    label: 'before portable-host adversarial qualification',
    artifactCommit: 'ae46906321983a7fe67511754a731b1a06877fad',
    sourceCommit: '775130c435458c7786d01cd376dc8566744c44b7',
  },
  {
    label: 'after adversarial qualification and before external-host qualification',
    artifactCommit: 'b8354a3fd9f932aa3995e5a6d680220e39cd9de2',
    sourceCommit: 'ae46906321983a7fe67511754a731b1a06877fad',
  },
  {
    label: 'after external-host qualification',
    artifactCommit: '07b1d53ff2ef6440ceaa3ad540c10cb7f48062cb',
    sourceCommit: 'b47d8a0bb1935f16229b53efd794e40438e9d6b1',
  },
];

async function historicalReceipt(snapshot) {
  const { stdout } = await execFileAsync('git', [
    '-C', repositoryRoot, 'show', `${snapshot.artifactCommit}:${artifactPath}`,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.source.godagents.commit, snapshot.sourceCommit);
  return receipt;
}

function verify(receipt) {
  return verifyCrossRepositoryCurrentHeadCertificateV2(receipt, {
    godagentsRoot: repositoryRoot,
    godskillsRoot,
    expectedGodagentsCommit: receipt.source.godagents.commit,
    expectedGodskillsCommit: receipt.source.godskills.commit,
    requireExactRefs: false,
  });
}

function rehash(receipt) {
  const { receiptDigest: _old, ...unsigned } = receipt;
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

for (const snapshot of snapshots) {
  test(`verifies the unchanged historical v2 receipt ${snapshot.label}`, async () => {
    const receipt = await historicalReceipt(snapshot);
    assert.deepEqual(await verify(receipt), {
      status: 'verified',
      receiptDigest: receipt.receiptDigest,
    });
  });
}

test('historical compatibility does not let an adversarial-era receipt omit its evidence', async () => {
  const receipt = await historicalReceipt(snapshots[1]);
  delete receipt.godagents.evidence.portablePhaseHostAdversarial;
  await assert.rejects(verify(rehash(receipt)), /adversarial profile does not match/);
});

test('historical compatibility does not admit newer SDK exports into an older release', async () => {
  const receipt = await historicalReceipt(snapshots[1]);
  receipt.godagents.sdk.rootExports.push('buildExternalHostQualificationDossier');
  receipt.godagents.sdk.rootExports.sort();
  await assert.rejects(verify(rehash(receipt)), /SDK root export set mismatch/);
});

test('historical compatibility does not admit a newer adapter protocol into an older release', async () => {
  const receipt = await historicalReceipt(snapshots[1]);
  receipt.godagents.sdk.supportedAdapterProtocols.unshift('eternities-external-host-qualification-v1');
  await assert.rejects(verify(rehash(receipt)), /SDK supported adapter protocol set mismatch/);
});
