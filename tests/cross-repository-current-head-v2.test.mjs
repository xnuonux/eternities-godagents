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
  godagentsFocused: { status: 'pass', tests: 144 },
  godagentsFull: { status: 'pass', tests: 1096 },
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

async function hasCommittedPath(commit, path) {
  try {
    await execFileAsync('git', ['cat-file', '-e', `${commit}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
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
  const forensicsCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/mission-program-forensics-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.missionProgramForensics !== undefined,
    forensicsCommitted,
    'v2 builder profile must follow the committed forensic receipt boundary',
  );
  assert.equal(receipt.protocolId, CROSS_REPOSITORY_CURRENT_HEAD_V2_PROTOCOL);
  assert.equal(receipt.status, 'certified');
  assert.deepEqual(receipt.source, { godagents: { repository: 'eternities-godagents', commit: godagentsCommit, refs: refs.godagents }, godskills: { repository: 'eternities-godskills', commit: godskillsCommit, refs: refs.godskills } });
  assert.deepEqual(receipt.godagents.sdk.packageExports, {
    '.': './src/sdk/index.mjs',
    './economics': './src/sdk/economics.mjs',
  });
  assert.deepEqual(receipt.godagents.sdk.rootExports, [
    'EXTERNAL_HOST_QUALIFICATION_PROTOCOL_ID',
    'GODAGENT_SDK_PROTOCOL_ID',
    'GODAGENT_SDK_VERSION',
    'PORTABLE_PHASE_HOST_PROTOCOL_ID',
    'RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID',
    'assertPortablePhaseHostInstance',
    'assertProviderPhaseHostInstance',
    'assertRecoverableRealmConsequenceHost',
    'buildExternalHostQualificationDossier',
    'buildPortablePhaseHostDescription',
    'createAdmittedPortableIdentityLauncher',
    'createAdmittedProviderBackedIdentityLauncher',
    'createPortablePhaseHostAdapter',
    'createProviderPhaseHost',
    'createRecoverableRealmConsequenceHost',
    'describeGodagentSdk',
    'verifyAdmittedPortableIdentityLauncherDescription',
    'verifyAdmittedProviderBackedIdentityLauncherDescription',
    'verifyExternalHostQualificationDossier',
    'verifyPortablePhaseHostDescription',
    'verifyProviderPhaseHostDescription',
  ]);
  assert.deepEqual(receipt.godagents.sdk.supportedAdapterProtocols, [
    'eternities-external-host-qualification-v1',
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
  assert.equal(
    receipt.godagents.evidence.admittedPortableIdentityLauncher.certificationId,
    'admitted-portable-identity-launcher-v1',
  );
  assert.equal(
    receipt.godagents.evidence.admittedPortableIdentityLauncher.fixtureDigest,
    '19517ce24004672fa65f05cd4d1feba3dd9e80412118215eae1620775d51f884',
  );
  assert.equal(receipt.godagents.evidence.admittedPortableIdentityLauncher.fullTests, 988);
  assert.equal(
    receipt.godagents.evidence.admittedPortableIdentityLauncher.path,
    'receipts/admitted-portable-identity-launcher-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.admittedPortableIdentityLauncher.receiptDigest,
    'fcf5f7975606cac1e6588193b4a4e1f75de6b2007553ebfcb5b4a4e0c2231631',
  );
  assert.equal(
    receipt.godagents.evidence.admittedPortableIdentityLauncher.sourceCommit,
    'ba5e489fac7840fe6407ab1455f8e29a1196efa2',
  );
  assert.equal(receipt.godagents.evidence.missionProgram.certificationId, 'mission-program-v1');
  assert.equal(
    receipt.godagents.evidence.missionProgram.fixtureDigest,
    '4fb78a7d214830ba124ecce19478b4b306ef400bb4f1817cda325c2ed2abc226',
  );
  assert.equal(receipt.godagents.evidence.missionProgram.fullTests, 1004);
  assert.equal(receipt.godagents.evidence.missionProgram.path, 'receipts/mission-program-v1.json');
  assert.match(receipt.godagents.evidence.missionProgram.receiptDigest, /^[a-f0-9]{64}$/);
  assert.equal(
    receipt.godagents.evidence.missionProgram.sourceCommit,
    'd393f6891776fab07c008def6efe1ef8edac5db7',
  );
  if (receipt.godagents.evidence.missionProgramForensics !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/mission-program-forensics.test.mjs',
      ),
      'current v2 profile must bind the forensic boundary paths',
    );
    assert.equal(receipt.godagents.evidence.missionProgramForensics.certificationId, 'mission-program-forensics-v1');
    assert.match(receipt.godagents.evidence.missionProgramForensics.fixtureDigest, /^[a-f0-9]{64}$/);
    assert.equal(receipt.godagents.evidence.missionProgramForensics.fullTests, 1009);
    assert.equal(receipt.godagents.evidence.missionProgramForensics.path, 'receipts/mission-program-forensics-v1.json');
    assert.match(receipt.godagents.evidence.missionProgramForensics.receiptDigest, /^[a-f0-9]{64}$/);
    assert.match(receipt.godagents.evidence.missionProgramForensics.sourceCommit, /^[a-f0-9]{40}$/);
  }
  const agentProfileCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/agent-profile-contract-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.agentProfileContract !== undefined,
    agentProfileCommitted,
    'v2 builder profile must follow the committed agent profile receipt boundary',
  );
  if (receipt.godagents.evidence.agentProfileContract !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/agent-profile-contract.test.mjs',
      ),
      'current v2 profile must bind the agent profile boundary paths',
    );
    assert.equal(receipt.godagents.evidence.agentProfileContract.certificationId, 'agent-profile-contract-v1');
    assert.match(receipt.godagents.evidence.agentProfileContract.fixtureDigest, /^[a-f0-9]{64}$/);
    assert.equal(receipt.godagents.evidence.agentProfileContract.fullTests, 1018);
    assert.equal(receipt.godagents.evidence.agentProfileContract.path, 'receipts/agent-profile-contract-v1.json');
    assert.match(receipt.godagents.evidence.agentProfileContract.receiptDigest, /^[a-f0-9]{64}$/);
    assert.match(receipt.godagents.evidence.agentProfileContract.sourceCommit, /^[a-f0-9]{40}$/);
  }
  const missionOperationCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/mission-operation-adapter-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.missionOperationAdapter !== undefined,
    missionOperationCommitted,
    'v2 builder profile must follow the committed mission operation adapter receipt boundary',
  );
  if (receipt.godagents.evidence.missionOperationAdapter !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/mission-operation-adapter.test.mjs',
      ),
      'current v2 profile must bind the mission operation adapter boundary paths',
    );
    assert.equal(receipt.godagents.evidence.missionOperationAdapter.certificationId, 'mission-operation-adapter-v1');
    assert.match(receipt.godagents.evidence.missionOperationAdapter.fixtureDigest, /^[a-f0-9]{64}$/);
    assert.equal(receipt.godagents.evidence.missionOperationAdapter.fullTests, 1029);
    assert.equal(receipt.godagents.evidence.missionOperationAdapter.path, 'receipts/mission-operation-adapter-v1.json');
    assert.match(receipt.godagents.evidence.missionOperationAdapter.receiptDigest, /^[a-f0-9]{64}$/);
    assert.match(receipt.godagents.evidence.missionOperationAdapter.sourceCommit, /^[a-f0-9]{40}$/);
  }
  const deferredReviewMissionOperationCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/review-mission-operation-adapter-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.deferredReviewMissionOperationAdapter !== undefined,
    deferredReviewMissionOperationCommitted,
    'v2 builder profile must follow the committed deferred review adapter receipt boundary',
  );
  if (receipt.godagents.evidence.deferredReviewMissionOperationAdapter !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/review-mission-operation-adapter.test.mjs',
      ),
      'current v2 profile must bind the deferred review adapter boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.deferredReviewMissionOperationAdapter.certificationId,
      'deferred-review-mission-operation-adapter-v1',
    );
    assert.equal(
      receipt.godagents.evidence.deferredReviewMissionOperationAdapter.fullTests,
      1040,
    );
    assert.equal(
      receipt.godagents.evidence.deferredReviewMissionOperationAdapter.path,
      'receipts/review-mission-operation-adapter-v1.json',
    );
    assert.match(
      receipt.godagents.evidence.deferredReviewMissionOperationAdapter.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.deferredReviewMissionOperationAdapter.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.deferredReviewMissionOperationAdapter.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
  const revisionMissionOperationCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/revision-mission-operation-adapter-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.revisionMissionOperationAdapter !== undefined,
    revisionMissionOperationCommitted,
    'v2 builder profile must follow the committed revision adapter receipt boundary',
  );
  if (receipt.godagents.evidence.revisionMissionOperationAdapter !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/revision-mission-operation-adapter.test.mjs',
      ),
      'current v2 profile must bind the revision adapter boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.revisionMissionOperationAdapter.certificationId,
      'revision-mission-operation-adapter-v1',
    );
    assert.equal(
      receipt.godagents.evidence.revisionMissionOperationAdapter.fullTests,
      1051,
    );
    assert.equal(
      receipt.godagents.evidence.revisionMissionOperationAdapter.path,
      'receipts/revision-mission-operation-adapter-v1.json',
    );
    assert.match(
      receipt.godagents.evidence.revisionMissionOperationAdapter.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.revisionMissionOperationAdapter.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.revisionMissionOperationAdapter.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
  const delegationMissionOperationCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/delegation-mission-operation-adapter-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.delegationMissionOperationAdapter !== undefined,
    delegationMissionOperationCommitted,
    'v2 builder profile must follow the committed delegation adapter receipt boundary',
  );
  if (receipt.godagents.evidence.delegationMissionOperationAdapter !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/delegation-mission-operation-adapter.test.mjs',
      ),
      'current v2 profile must bind the delegation adapter boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.delegationMissionOperationAdapter.certificationId,
      'delegation-mission-operation-adapter-v1',
    );
    assert.equal(
      receipt.godagents.evidence.delegationMissionOperationAdapter.fullTests,
      1059,
    );
    assert.equal(
      receipt.godagents.evidence.delegationMissionOperationAdapter.path,
      'receipts/delegation-mission-operation-adapter-v1.json',
    );
    assert.match(
      receipt.godagents.evidence.delegationMissionOperationAdapter.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.delegationMissionOperationAdapter.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.delegationMissionOperationAdapter.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
  const realmConsequenceMissionOperationCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/realm-consequence-mission-operation-adapter-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.realmConsequenceMissionOperationAdapter !== undefined,
    realmConsequenceMissionOperationCommitted,
    'v2 builder profile must follow the committed Realm consequence adapter boundary',
  );
  if (receipt.godagents.evidence.realmConsequenceMissionOperationAdapter !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/realm-consequence-mission-operation-adapter.test.mjs',
      ),
      'current v2 profile must bind the Realm consequence adapter boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.realmConsequenceMissionOperationAdapter.certificationId,
      'realm-consequence-mission-operation-adapter-v1',
    );
    assert.equal(
      receipt.godagents.evidence.realmConsequenceMissionOperationAdapter.fullTests,
      1066,
    );
    assert.equal(
      receipt.godagents.evidence.realmConsequenceMissionOperationAdapter.path,
      'receipts/realm-consequence-mission-operation-adapter-v1.json',
    );
    assert.match(
      receipt.godagents.evidence.realmConsequenceMissionOperationAdapter.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.realmConsequenceMissionOperationAdapter.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.realmConsequenceMissionOperationAdapter.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
  const missionOperationEvidenceCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/mission-operation-evidence-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.missionOperationEvidence !== undefined,
    missionOperationEvidenceCommitted,
    'v2 builder profile must follow the committed mission operation evidence projection boundary',
  );
  if (receipt.godagents.evidence.missionOperationEvidence !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/mission-operation-evidence.test.mjs',
      ),
      'current v2 profile must bind the mission operation evidence projection boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.missionOperationEvidence.certificationId,
      'mission-operation-evidence-v1',
    );
    assert.equal(
      receipt.godagents.evidence.missionOperationEvidence.fullTests,
      1070,
    );
    assert.equal(
      receipt.godagents.evidence.missionOperationEvidence.path,
      'receipts/mission-operation-evidence-v1.json',
    );
    assert.match(
      receipt.godagents.evidence.missionOperationEvidence.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.missionOperationEvidence.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.missionOperationEvidence.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
  const missionForensicIndexCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/mission-forensic-index-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.missionForensicIndex !== undefined,
    missionForensicIndexCommitted,
    'v2 builder profile must follow the committed mission forensic index boundary',
  );
  if (receipt.godagents.evidence.missionForensicIndex !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/mission-forensic-index.test.mjs',
      ),
      'current v2 profile must bind the mission forensic index boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.missionForensicIndex.certificationId,
      'mission-forensic-index-v1',
    );
    assert.equal(
      receipt.godagents.evidence.missionForensicIndex.fullTests,
      1073,
    );
    assert.equal(
      receipt.godagents.evidence.missionForensicIndex.path,
      'receipts/mission-forensic-index-v1.json',
    );
    assert.match(
      receipt.godagents.evidence.missionForensicIndex.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.missionForensicIndex.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.missionForensicIndex.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
  const portablePhaseHostAdversarialCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/portable-phase-host-adversarial-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.portablePhaseHostAdversarial !== undefined,
    portablePhaseHostAdversarialCommitted,
    'v2 builder profile must follow the committed portable phase-host adversarial boundary',
  );
  if (receipt.godagents.evidence.portablePhaseHostAdversarial !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/portable-phase-host-adversarial.test.mjs',
      ),
      'current v2 profile must bind the portable phase-host adversarial boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.portablePhaseHostAdversarial.certificationId,
      'portable-phase-host-adversarial-v1',
    );
    assert.equal(
      receipt.godagents.evidence.portablePhaseHostAdversarial.fullTests,
      1081,
    );
    assert.equal(
      receipt.godagents.evidence.portablePhaseHostAdversarial.path,
      'receipts/portable-phase-host-adversarial-v1.json',
    );
    assert.match(
      receipt.godagents.evidence.portablePhaseHostAdversarial.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.portablePhaseHostAdversarial.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.portablePhaseHostAdversarial.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
  const externalHostQualificationCommitted = await hasCommittedPath(
    godagentsCommit,
    'receipts/external-host-qualification-v1.json',
  );
  assert.equal(
    receipt.godagents.evidence.externalHostQualification !== undefined,
    externalHostQualificationCommitted,
    'v2 builder profile must follow the committed external host qualification boundary',
  );
  if (receipt.godagents.evidence.externalHostQualification !== undefined) {
    assert.ok(
      receipt.godagents.evidence.boundaryFiles.some(
        ({ path }) => path === 'tests/external-host-qualification.test.mjs',
      ),
      'current v2 profile must bind the external host qualification boundary paths',
    );
    assert.equal(
      receipt.godagents.evidence.externalHostQualification.certificationId,
      'external-host-qualification-v1',
    );
    assert.equal(receipt.godagents.evidence.externalHostQualification.fullTests, 1096);
    assert.equal(
      receipt.godagents.evidence.externalHostQualification.path,
      'receipts/external-host-qualification-v1.json',
    );
    assert.equal(receipt.godagents.evidence.externalHostQualification.liveQualification, false);
    assert.match(
      receipt.godagents.evidence.externalHostQualification.fixtureDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.externalHostQualification.receiptDigest,
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      receipt.godagents.evidence.externalHostQualification.sourceCommit,
      /^[a-f0-9]{40}$/,
    );
  }
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
  await assert.rejects(
    () => buildCrossRepositoryCurrentHeadCertificateV2({
      godagentsRoot: repositoryRoot,
      godskillsRoot,
      godagentsCommit: '0'.repeat(40),
      godskillsCommit,
      refs,
      adaptiveReviewPin: pinnedGodskillsReviewRelease(godskillsRoot),
      adaptiveReviewSource: {
        path: 'scripts/lib/pinned-godskills-review-release.mjs',
        sourceCommit: pinnedGodskillsReviewSourceCommit,
      },
      testRuns,
    }),
    /Godagents build commit|does not exist|object/i,
  );
});

test('the two v1 cross-repository artifacts remain byte-identical while v2 is added', async () => {
  for (const path of oldArtifacts) {
    assert.deepEqual(await readFile(new URL(`../${path}`, import.meta.url)), await sourceArtifact(path), path);
  }
});
