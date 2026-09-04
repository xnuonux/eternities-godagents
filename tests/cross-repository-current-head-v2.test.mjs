import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

import { sha256Value } from '../src/core/digest.mjs';
import {
  CROSS_REPOSITORY_CURRENT_HEAD_V2_PROTOCOL,
  buildCrossRepositoryCurrentHeadCertificateV2,
  verifyCrossRepositoryCurrentHeadCertificateV2,
} from '../src/integration/current-head-certificate.mjs';
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from '../scripts/lib/pinned-godskills-review-release.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const godskillsRoot = 'C:/dev/eternities-godskills';
const execFileAsync = promisify(execFile);
const testRuns = Object.freeze({
  godagentsFocused: { status: 'pass', tests: 18 },
  godagentsFull: { status: 'pass', tests: 948 },
  godskillsFocused: { status: 'pass', tests: 12 },
});
const oldArtifacts = Object.freeze([
  'integrations/cross-repository-current-head-v1.json',
  'integrations/cross-repository-issuance-snapshot-v1.json',
]);

async function reconciledHead(root, label) {
  const [main, originMain] = await Promise.all([
    execFileAsync('git', ['-C', root, 'rev-parse', 'main'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', root, 'rev-parse', 'origin/main'], { encoding: 'utf8', windowsHide: true }),
  ]);
  const mainCommit = main.stdout.trim();
  const originCommit = originMain.stdout.trim();
  assert.equal(mainCommit, originCommit, `${label} refs must be reconciled`);
  return mainCommit;
}

const godagentsCommit = await reconciledHead(repositoryRoot, 'Godagents');
const godskillsCommit = await reconciledHead(godskillsRoot, 'Godskills');
const refs = Object.freeze({
  godagents: { main: godagentsCommit, originMain: godagentsCommit },
  godskills: { main: godskillsCommit, originMain: godskillsCommit },
});

async function sourceArtifact(path) {
  const { stdout } = await execFileAsync('git', ['show', `main:${path}`], {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function build() {
  return buildCrossRepositoryCurrentHeadCertificateV2({
    godagentsRoot: repositoryRoot,
    godskillsRoot,
    godagentsCommit,
    godskillsCommit,
    refs,
    adaptiveReviewPin: pinnedGodskillsReviewRelease(godskillsRoot),
    adaptiveReviewSource: {
      path: 'scripts/lib/pinned-godskills-review-release.mjs',
      sourceCommit: pinnedGodskillsReviewSourceCommit,
    },
    testRuns,
  });
}

function rehash(value) {
  const { receiptDigest: _old, ...unsigned } = value;
  return { ...value, receiptDigest: sha256Value(unsigned) };
}

test('v2 names the current-head protocol and binds the merged portable surface', async () => {
  const receipt = await build();
  assert.equal(receipt.protocolId, CROSS_REPOSITORY_CURRENT_HEAD_V2_PROTOCOL);
  assert.equal(receipt.status, 'certified');
  assert.deepEqual(receipt.source, { godagents: { repository: 'eternities-godagents', commit: godagentsCommit, refs: refs.godagents }, godskills: { repository: 'eternities-godskills', commit: godskillsCommit, refs: refs.godskills } });
  assert.deepEqual(receipt.godagents.sdk.rootExports, [
    'GODAGENT_SDK_PROTOCOL_ID',
    'GODAGENT_SDK_VERSION',
    'PORTABLE_PHASE_HOST_PROTOCOL_ID',
    'RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID',
    'assertPortablePhaseHostInstance',
    'assertProviderPhaseHostInstance',
    'assertRecoverableRealmConsequenceHost',
    'buildPortablePhaseHostDescription',
    'createAdmittedProviderBackedIdentityLauncher',
    'createPortablePhaseHostAdapter',
    'createProviderPhaseHost',
    'createRecoverableRealmConsequenceHost',
    'describeGodagentSdk',
    'verifyAdmittedProviderBackedIdentityLauncherDescription',
    'verifyPortablePhaseHostDescription',
    'verifyProviderPhaseHostDescription',
  ]);
  assert.deepEqual(receipt.godagents.sdk.supportedAdapterProtocols, [
    'eternities-portable-phase-host-v1',
    'eternities-recoverable-realm-consequence-v1',
  ]);
  assert.equal(receipt.godagents.evidence.portablePhaseHost.certificationId, 'portable-phase-host-conformance-v1');
  assert.equal(receipt.godagents.evidence.portablePhaseHost.sourceCommit, '6680b64cf8c820e04a0045e445956f2c13e8afdf');
  assert.match(receipt.godagents.evidence.portablePhaseHost.receiptDigest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.godagents.evidence.portableRealmConsequenceSdk.certificationId, 'portable-realm-consequence-sdk-v1');
  assert.equal(receipt.godagents.evidence.portableRealmConsequenceSdk.sourceCommit, 'a0ebffe1373cd3af06b0aec8a392724d939e49b0');
  assert.equal(receipt.godagents.evidence.portableRealmConsequenceSdk.fullTests, 948);
  assert.match(receipt.godagents.evidence.portableRealmConsequenceSdk.receiptDigest, /^[a-f0-9]{64}$/);
});

test('v2 verification fails closed on old heads, SDK drift, portable receipt drift, and ref movement', async () => {
  const original = await build();
  await assert.rejects(
    () => verifyCrossRepositoryCurrentHeadCertificateV2(original, {
      godagentsRoot: repositoryRoot,
      godskillsRoot,
      expectedGodagentsCommit: '95a93f1a115d72f7b25a725e7da42ea4b684faae',
      expectedGodskillsCommit: godskillsCommit,
      requireExactRefs: true,
    }),
    /Godagents head|certificate|main ref/i,
  );
  await assert.rejects(
    () => verifyCrossRepositoryCurrentHeadCertificateV2(rehash({
      ...structuredClone(original),
      godagents: {
        ...structuredClone(original.godagents),
        sdk: { ...structuredClone(original.godagents.sdk), rootExports: ['forged'] },
      },
    }), { godagentsRoot: repositoryRoot, godskillsRoot }),
    /SDK|export|digest/i,
  );
  await assert.rejects(
    () => verifyCrossRepositoryCurrentHeadCertificateV2(rehash({
      ...structuredClone(original),
      godagents: {
        ...structuredClone(original.godagents),
        evidence: {
          ...structuredClone(original.godagents.evidence),
          portablePhaseHost: {
            ...structuredClone(original.godagents.evidence.portablePhaseHost),
            receiptDigest: 'f'.repeat(64),
          },
        },
      },
    }), { godagentsRoot: repositoryRoot, godskillsRoot }),
    /portable|receipt|digest/i,
  );
  await assert.rejects(
    () => verifyCrossRepositoryCurrentHeadCertificateV2(rehash({
      ...structuredClone(original),
      godagents: {
        ...structuredClone(original.godagents),
        evidence: {
          ...structuredClone(original.godagents.evidence),
          portableRealmConsequenceSdk: {
            ...structuredClone(original.godagents.evidence.portableRealmConsequenceSdk),
            receiptDigest: 'f'.repeat(64),
          },
        },
      },
    }), { godagentsRoot: repositoryRoot, godskillsRoot }),
    /portable|Realm|receipt|digest/i,
  );
  await assert.rejects(
    () => buildCrossRepositoryCurrentHeadCertificateV2({
      godagentsRoot: repositoryRoot,
      godskillsRoot,
      godagentsCommit,
      godskillsCommit,
      refs: { ...refs, godagents: { main: '95a93f1a115d72f7b25a725e7da42ea4b684faae', originMain: '95a93f1a115d72f7b25a725e7da42ea4b684faae' } },
      adaptiveReviewPin: pinnedGodskillsReviewRelease(godskillsRoot),
      adaptiveReviewSource: { path: 'scripts/lib/pinned-godskills-review-release.mjs', sourceCommit: pinnedGodskillsReviewSourceCommit },
      testRuns,
    }),
    /reconciled refs|head/i,
  );
});

test('the two v1 cross-repository artifacts remain byte-identical while v2 is added', async () => {
  for (const path of oldArtifacts) {
    assert.deepEqual(await readFile(new URL(`../${path}`, import.meta.url)), await sourceArtifact(path), path);
  }
});
