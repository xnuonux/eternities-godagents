import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';

const execFileAsync = promisify(execFile);

export const CROSS_REPOSITORY_CURRENT_HEAD_PROTOCOL =
  'eternities-godagents-cross-repository-current-head-certificate-v1';
export const CROSS_REPOSITORY_CURRENT_HEAD_V2_PROTOCOL =
  'eternities-godagents-cross-repository-current-head-certificate-v2';
export const CROSS_REPOSITORY_CURRENT_HEAD_V2_ARTIFACT_PATH =
  'integrations/cross-repository-current-head-v2.json';
export const CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_PATH =
  'docs/cross-repository-current-head-v2-certification.md';
export const CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_DOCUMENT = [
  '# cross-repository current-head certificate v2',
  '',
  'this document certifies the adjacent canonical v2 integration artifact.',
  '',
  `protocol: ${CROSS_REPOSITORY_CURRENT_HEAD_V2_PROTOCOL}`,
  '',
  'it binds exact source commits, refs, manifests, boundary evidence, and test gates.',
  '',
].join('\n');
export const CROSS_REPOSITORY_ISSUANCE_SNAPSHOT_PROTOCOL =
  'eternities-godagents-cross-repository-issuance-snapshot-v1';

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADAPTER_PROTOCOL = 'eternities-godskills-adapter-v1';
const ACTIVATION_PROTOCOL = 'eternities-godskills-activation-v1';
const SDK_PACKAGE_PATH = 'package.json';
const SDK_ENTRYPOINT_PATH = 'src/sdk/index.mjs';
const SDK_ECONOMICS_ENTRYPOINT_PATH = 'src/sdk/economics.mjs';
const HOST_POLICY_PATH = 'fixtures/host-policy.json';
const ADAPTIVE_SOURCE_PATH = 'scripts/lib/pinned-godskills-review-release.mjs';
const BEACON_SNAPSHOT_PATH = 'receipts/eternities-beacon-release-v1-snapshot.json';
const INTEGRATION_RECEIPT_PATH = 'receipts/godskills-v3-integration.json';
const PORTABLE_CONFORMANCE_RECEIPT_PATH = 'receipts/portable-phase-host-conformance-v1.json';
const PORTABLE_CONFORMANCE_CERTIFICATION_ID = 'portable-phase-host-conformance-v1';
const PORTABLE_CONFORMANCE_PROTOCOL = 'eternities-portable-phase-host-v1';
const PORTABLE_REALM_CONSEQUENCE_SDK_RECEIPT_PATH = 'receipts/portable-realm-consequence-sdk-v1.json';
const PORTABLE_REALM_CONSEQUENCE_SDK_CERTIFICATION_ID = 'portable-realm-consequence-sdk-v1';
const PORTABLE_REALM_CONSEQUENCE_SDK_CERTIFICATION_PROTOCOL = 'eternities-portable-realm-consequence-sdk-certification-v1';
const PORTABLE_REALM_CONSEQUENCE_SDK_PROTOCOL = 'eternities-recoverable-realm-consequence-v1';
const ADMITTED_PORTABLE_IDENTITY_LAUNCHER_RECEIPT_PATH = 'receipts/admitted-portable-identity-launcher-v1.json';
const ADMITTED_PORTABLE_IDENTITY_LAUNCHER_CERTIFICATION_ID = 'admitted-portable-identity-launcher-v1';
const ADMITTED_PORTABLE_IDENTITY_LAUNCHER_CERTIFICATION_PROTOCOL = 'eternities-admitted-portable-identity-launcher-certification-v1';
const MISSION_PROGRAM_RECEIPT_PATH = 'receipts/mission-program-v1.json';
const MISSION_PROGRAM_CERTIFICATION_ID = 'mission-program-v1';
const MISSION_PROGRAM_CERTIFICATION_PROTOCOL = 'eternities-long-horizon-mission-program-certification-v1';
const MISSION_PROGRAM_FORENSICS_RECEIPT_PATH = 'receipts/mission-program-forensics-v1.json';
const MISSION_PROGRAM_FORENSICS_CERTIFICATION_ID = 'mission-program-forensics-v1';
const MISSION_PROGRAM_FORENSICS_CERTIFICATION_PROTOCOL = 'eternities-mission-program-forensics-certification-v1';
const AGENT_PROFILE_CONTRACT_RECEIPT_PATH = 'receipts/agent-profile-contract-v1.json';
const AGENT_PROFILE_CONTRACT_CERTIFICATION_ID = 'agent-profile-contract-v1';
const AGENT_PROFILE_CONTRACT_CERTIFICATION_PROTOCOL = 'eternities-godagent-profile-certification-v1';
const MISSION_OPERATION_ADAPTER_RECEIPT_PATH = 'receipts/mission-operation-adapter-v1.json';
const MISSION_OPERATION_ADAPTER_CERTIFICATION_ID = 'mission-operation-adapter-v1';
const MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL = 'eternities-mission-operation-adapter-certification-v1';
const DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH = 'receipts/review-mission-operation-adapter-v1.json';
const DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID = 'deferred-review-mission-operation-adapter-v1';
const DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL = 'eternities-deferred-review-mission-operation-adapter-certification-v1';
const REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH = 'receipts/revision-mission-operation-adapter-v1.json';
const REVISION_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID = 'revision-mission-operation-adapter-v1';
const REVISION_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL = 'eternities-revision-mission-operation-adapter-certification-v1';
const DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH = 'receipts/delegation-mission-operation-adapter-v1.json';
const DELEGATION_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID = 'delegation-mission-operation-adapter-v1';
const DELEGATION_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL = 'eternities-delegation-mission-operation-adapter-certification-v1';
const REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH = 'receipts/realm-consequence-mission-operation-adapter-v1.json';
const REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID = 'realm-consequence-mission-operation-adapter-v1';
const REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL = 'eternities-realm-consequence-mission-operation-adapter-certification-v1';
const MISSION_OPERATION_EVIDENCE_RECEIPT_PATH = 'receipts/mission-operation-evidence-v1.json';
const MISSION_OPERATION_EVIDENCE_CERTIFICATION_ID = 'mission-operation-evidence-v1';
const MISSION_OPERATION_EVIDENCE_CERTIFICATION_PROTOCOL = 'eternities-mission-operation-evidence-certification-v1';
const MISSION_FORENSIC_INDEX_RECEIPT_PATH = 'receipts/mission-forensic-index-v1.json';
const MISSION_FORENSIC_INDEX_CERTIFICATION_ID = 'mission-forensic-index-v1';
const MISSION_FORENSIC_INDEX_CERTIFICATION_PROTOCOL = 'eternities-mission-forensic-index-certification-v1';
const PORTABLE_PHASE_HOST_ADVERSARIAL_RECEIPT_PATH = 'receipts/portable-phase-host-adversarial-v1.json';
const PORTABLE_PHASE_HOST_ADVERSARIAL_CERTIFICATION_ID = 'portable-phase-host-adversarial-v1';
const PORTABLE_PHASE_HOST_ADVERSARIAL_CERTIFICATION_PROTOCOL = 'eternities-portable-phase-host-adversarial-certification-v1';
const SDK_EXPORTS = Object.freeze([
  'GODAGENT_SDK_PROTOCOL_ID',
  'GODAGENT_SDK_VERSION',
  'assertProviderPhaseHostInstance',
  'createAdmittedProviderBackedIdentityLauncher',
  'createProviderPhaseHost',
  'describeGodagentSdk',
  'verifyAdmittedProviderBackedIdentityLauncherDescription',
  'verifyProviderPhaseHostDescription',
]);
const V2_SDK_EXPORTS = Object.freeze([
  'GODAGENT_SDK_PROTOCOL_ID',
  'GODAGENT_SDK_VERSION',
  'PORTABLE_PHASE_HOST_PROTOCOL_ID',
  'RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID',
  'assertPortablePhaseHostInstance',
  'assertProviderPhaseHostInstance',
  'assertRecoverableRealmConsequenceHost',
  'buildPortablePhaseHostDescription',
  'createAdmittedPortableIdentityLauncher',
  'createAdmittedProviderBackedIdentityLauncher',
  'createPortablePhaseHostAdapter',
  'createProviderPhaseHost',
  'createRecoverableRealmConsequenceHost',
  'describeGodagentSdk',
  'verifyAdmittedPortableIdentityLauncherDescription',
  'verifyPortablePhaseHostDescription',
  'verifyAdmittedProviderBackedIdentityLauncherDescription',
  'verifyProviderPhaseHostDescription',
].sort());
const LEGACY_PACKAGE_EXPORTS = Object.freeze({ '.': `./${SDK_ENTRYPOINT_PATH}` });
const V2_PACKAGE_EXPORTS = Object.freeze({
  '.': `./${SDK_ENTRYPOINT_PATH}`,
  './economics': `./${SDK_ECONOMICS_ENTRYPOINT_PATH}`,
});
const BOUNDARY_PATHS = Object.freeze([
  'src/sdk/index.mjs',
  'src/skills/godskills-adapter.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/release-verifier.mjs',
  'tests/godskills-adaptive-activation.test.mjs',
  'tests/godskills-mission-binder.test.mjs',
  'tests/godskills-v3-integration.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
].sort());
const V2_BOUNDARY_PATHS = Object.freeze([
  ...new Set([
    ...BOUNDARY_PATHS,
    SDK_ECONOMICS_ENTRYPOINT_PATH,
    'fixtures/portable-realm-consequence-sdk-v1.json',
    'schemas/portable-phase-host-description.schema.json',
    'src/realm/recoverable-consequence-host.mjs',
    'src/sdk/portable-phase-host.mjs',
    'tests/mission-economics-ledger-certification.test.mjs',
    'tests/mission-economics-ledger.test.mjs',
    'tests/portable-phase-host-conformance-certification.test.mjs',
    'tests/portable-phase-host-conformance.test.mjs',
    'tests/portable-realm-consequence-sdk-certification.test.mjs',
    'tests/portable-realm-consequence-sdk.test.mjs',
    'tests/admitted-portable-identity-launcher-certification.test.mjs',
    'tests/admitted-portable-identity-launcher-integration.test.mjs',
    'tests/admitted-portable-identity-launcher.test.mjs',
    'tests/portable-mission-dependencies.test.mjs',
    'src/runtime/mission-program.mjs',
    'tests/mission-program-certification.test.mjs',
    'tests/mission-program.test.mjs',
    'tests/mission-program-forensics-certification.test.mjs',
    'tests/mission-program-forensics.test.mjs',
    'schemas/mission-program-forensics.schema.json',
    'fixtures/mission-program-forensics-v1.json',
    MISSION_PROGRAM_RECEIPT_PATH,
    MISSION_PROGRAM_FORENSICS_RECEIPT_PATH,
    'fixtures/agent-profile-contract-v1.json',
    'schemas/godagent-profile.schema.json',
    'src/agent/profile.mjs',
    'src/creation/contracts.mjs',
    'src/skills/capability-policy.mjs',
    'tests/agent-profile-contract-certification.test.mjs',
    'tests/agent-profile-contract.test.mjs',
    AGENT_PROFILE_CONTRACT_RECEIPT_PATH,
    'fixtures/mission-operation-adapter-v1.json',
    'schemas/mission-operation-adapter.schema.json',
    'schemas/mission-operation-request.schema.json',
    'schemas/mission-operation-receipt.schema.json',
    'src/core/schema-validator.mjs',
    'src/runtime/mission-operation-adapter.mjs',
    'scripts/build-mission-operation-adapter-v1-fixture.mjs',
    'scripts/build-mission-operation-adapter-v1-receipt.mjs',
     'tests/mission-operation-adapter-certification.test.mjs',
     'tests/mission-operation-adapter.test.mjs',
     MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
     'fixtures/review-mission-operation-adapter-v1.json',
     'scripts/build-review-mission-operation-adapter-v1-fixture.mjs',
     'scripts/build-review-mission-operation-adapter-v1-receipt.mjs',
     'src/runtime/review-mission-operation-adapter.mjs',
     'tests/review-mission-operation-adapter-certification.test.mjs',
     'tests/review-mission-operation-adapter.test.mjs',
     DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
     'fixtures/revision-mission-operation-adapter-v1.json',
     'scripts/build-revision-mission-operation-adapter-v1-fixture.mjs',
     'scripts/build-revision-mission-operation-adapter-v1-receipt.mjs',
     'src/runtime/revision-mission-operation-adapter.mjs',
     'tests/revision-mission-operation-adapter-certification.test.mjs',
     'tests/revision-mission-operation-adapter.test.mjs',
     REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
     'fixtures/delegation-mission-operation-adapter-v1.json',
     'scripts/build-delegation-mission-operation-adapter-v1-fixture.mjs',
     'scripts/build-delegation-mission-operation-adapter-v1-receipt.mjs',
     'src/runtime/delegation-mission-operation-adapter.mjs',
     'tests/delegation-mission-operation-adapter-certification.test.mjs',
     'tests/delegation-mission-operation-adapter.test.mjs',
     DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
     'fixtures/realm-consequence-mission-operation-adapter-v1.json',
     'scripts/build-realm-consequence-mission-operation-adapter-v1-fixture.mjs',
     'scripts/build-realm-consequence-mission-operation-adapter-v1-receipt.mjs',
     'src/runtime/realm-consequence-mission-operation-adapter.mjs',
    'tests/realm-consequence-mission-operation-adapter-certification.test.mjs',
    'tests/realm-consequence-mission-operation-adapter.test.mjs',
    REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
    'fixtures/mission-operation-evidence-v1.json',
    'schemas/mission-operation-evidence.schema.json',
    'scripts/build-mission-operation-evidence-v1-fixture.mjs',
    'scripts/build-mission-operation-evidence-v1-receipt.mjs',
    'src/runtime/mission-operation-evidence.mjs',
    'tests/mission-operation-evidence-certification.test.mjs',
    'tests/mission-operation-evidence.test.mjs',
    MISSION_OPERATION_EVIDENCE_RECEIPT_PATH,
    'fixtures/mission-forensic-index-v1.json',
    'schemas/mission-forensic-index.schema.json',
    'scripts/build-mission-forensic-index-v1-fixture.mjs',
    'scripts/build-mission-forensic-index-v1-receipt.mjs',
    'src/runtime/mission-forensic-index.mjs',
    'tests/mission-forensic-index-certification.test.mjs',
    'tests/mission-forensic-index.test.mjs',
    MISSION_FORENSIC_INDEX_RECEIPT_PATH,
    'fixtures/portable-phase-host-adversarial-v1.json',
    'scripts/build-portable-phase-host-adversarial-v1-fixture.mjs',
    'scripts/build-portable-phase-host-adversarial-v1-receipt.mjs',
    'tests/helpers/portable-phase-host-adversarial-fixture.mjs',
    'tests/portable-phase-host-adversarial-certification.test.mjs',
    'tests/portable-phase-host-adversarial.test.mjs',
    PORTABLE_PHASE_HOST_ADVERSARIAL_RECEIPT_PATH,
   'fixtures/admitted-portable-identity-launcher-v1.json',
    'receipts/admitted-portable-identity-launcher-v1.json',
    'src/host/admitted-portable-identity-launcher.mjs',
    'src/host/portable-mission-dependencies.mjs',
    PORTABLE_CONFORMANCE_RECEIPT_PATH,
    PORTABLE_REALM_CONSEQUENCE_SDK_RECEIPT_PATH,
  ]),
].sort());
const PROOF_LIMITS = Object.freeze([
  'arbitrary-provider-or-model-quality',
  'arbitrary-unseen-mission-routing-correctness',
  'live-provider-quality',
  'multi-host-distributed-activation',
  'soul-or-inspiration-activation',
  'this-certificate-is-stale-after-either-bound-head-moves',
]);
const ROOT_REFERENCES = Object.freeze([
  ['systemReceipt', 'system-receipt'],
  ['routerReceipt', 'router-receipt'],
  ['compilerReceipt', 'compiler-receipt'],
  ['portableReceipt', 'portable-receipt'],
  ['portableManifest', 'portable-manifest'],
]);
const ACTIVATION_REFERENCES = Object.freeze([
  ['executableReceipt', 'activation-executable-receipt'],
  ['parentReceipt', 'activation-parent-receipt'],
  ['entrypoint', 'activation-entrypoint'],
  ['compiler', 'activation-compiler'],
  ['policy', 'activation-policy'],
  ['evidence', 'activation-evidence'],
  ['contract', 'activation-contract'],
]);
const ACTIVATION_IDENTITY = Object.freeze({
  executableReceipt: { id: 'adaptive-activation-executable-v1', status: 'verified-build' },
  parentReceipt: { id: 'adaptive-activation-v1', status: 'experimental' },
  policy: { id: 'adaptive-activation-policy-v1' },
  evidence: { id: 'adaptive-activation-evidence-v1' },
  contract: { id: 'adaptive-amplification-v1' },
});
const ROOT_IDENTITY = Object.freeze({
  systemReceipt: { id: 'eternities-godskills-system-v3', status: 'certified' },
  routerReceipt: { id: 'agent-native-router-v8', status: 'certified' },
  compilerReceipt: { id: 'intent-compiler-v3', status: 'certified' },
  portableReceipt: { status: 'certified-local-artifacts' },
  portableManifest: { manifestId: 'portable-capabilities-v1', status: 'certified-local-artifacts' },
});
const LEGACY_PROFILE = Object.freeze({
  packageExports: LEGACY_PACKAGE_EXPORTS,
  sdkExports: SDK_EXPORTS,
  boundaryPaths: BOUNDARY_PATHS,
  portableConformance: false,
});
const CURRENT_HEAD_V2_PROFILE = Object.freeze({
  packageExports: V2_PACKAGE_EXPORTS,
  sdkExports: V2_SDK_EXPORTS,
  boundaryPaths: V2_BOUNDARY_PATHS,
  portableConformance: true,
  portableRealmConsequenceSdk: true,
  portableRealmConsequenceSdkFullTests: 948,
  admittedPortableIdentityLauncher: true,
  admittedPortableIdentityLauncherFullTests: 988,
  missionProgram: true,
  missionProgramFullTests: 1004,
  missionProgramForensics: true,
  missionProgramForensicsFullTests: 1009,
  agentProfileContract: true,
  agentProfileContractFullTests: 1018,
  missionOperationAdapter: true,
  missionOperationAdapterFullTests: 1029,
  deferredReviewMissionOperationAdapter: true,
  deferredReviewMissionOperationAdapterFullTests: 1040,
  revisionMissionOperationAdapter: true,
  revisionMissionOperationAdapterFullTests: 1051,
  delegationMissionOperationAdapter: true,
  delegationMissionOperationAdapterFullTests: 1059,
  realmConsequenceMissionOperationAdapter: true,
  realmConsequenceMissionOperationAdapterFullTests: 1066,
  missionOperationEvidence: true,
  missionOperationEvidenceFullTests: 1070,
  missionForensicIndex: true,
  missionForensicIndexFullTests: 1073,
  portablePhaseHostAdversarial: true,
  portablePhaseHostAdversarialFullTests: 1081,
  supportedAdapterProtocols: Object.freeze([
    PORTABLE_CONFORMANCE_PROTOCOL,
    PORTABLE_REALM_CONSEQUENCE_SDK_PROTOCOL,
  ]),
  appendOnlyPaths: Object.freeze([
    CROSS_REPOSITORY_CURRENT_HEAD_V2_ARTIFACT_PATH,
    CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_PATH,
  ]),
  artifactPath: CROSS_REPOSITORY_CURRENT_HEAD_V2_ARTIFACT_PATH,
  certificationPath: CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_PATH,
  certificationDocument: CROSS_REPOSITORY_CURRENT_HEAD_V2_CERTIFICATION_DOCUMENT,
});
const PRE_PORTABLE_PHASE_HOST_ADVERSARIAL_V2_BOUNDARY_PATHS = Object.freeze(V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/portable-phase-host-adversarial-v1.json',
  'scripts/build-portable-phase-host-adversarial-v1-fixture.mjs',
  'scripts/build-portable-phase-host-adversarial-v1-receipt.mjs',
  'tests/helpers/portable-phase-host-adversarial-fixture.mjs',
  'tests/portable-phase-host-adversarial-certification.test.mjs',
  'tests/portable-phase-host-adversarial.test.mjs',
  PORTABLE_PHASE_HOST_ADVERSARIAL_RECEIPT_PATH,
].includes(path)));
const PRE_PORTABLE_PHASE_HOST_ADVERSARIAL_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_PORTABLE_PHASE_HOST_ADVERSARIAL_V2_BOUNDARY_PATHS,
  portablePhaseHostAdversarial: false,
  portablePhaseHostAdversarialFullTests: undefined,
});
const PRE_MISSION_FORENSIC_INDEX_V2_BOUNDARY_PATHS = Object.freeze(PRE_PORTABLE_PHASE_HOST_ADVERSARIAL_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/mission-forensic-index-v1.json',
  'schemas/mission-forensic-index.schema.json',
  'scripts/build-mission-forensic-index-v1-fixture.mjs',
  'scripts/build-mission-forensic-index-v1-receipt.mjs',
  'src/runtime/mission-forensic-index.mjs',
  'tests/mission-forensic-index-certification.test.mjs',
  'tests/mission-forensic-index.test.mjs',
  MISSION_FORENSIC_INDEX_RECEIPT_PATH,
].includes(path)));
const PRE_MISSION_FORENSIC_INDEX_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...PRE_PORTABLE_PHASE_HOST_ADVERSARIAL_CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_MISSION_FORENSIC_INDEX_V2_BOUNDARY_PATHS,
  missionForensicIndex: false,
  missionForensicIndexFullTests: undefined,
});
const PRE_MISSION_OPERATION_EVIDENCE_V2_BOUNDARY_PATHS = Object.freeze(PRE_MISSION_FORENSIC_INDEX_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/mission-operation-evidence-v1.json',
  'schemas/mission-operation-evidence.schema.json',
  'scripts/build-mission-operation-evidence-v1-fixture.mjs',
  'scripts/build-mission-operation-evidence-v1-receipt.mjs',
  'src/runtime/mission-operation-evidence.mjs',
  'tests/mission-operation-evidence-certification.test.mjs',
  'tests/mission-operation-evidence.test.mjs',
  MISSION_OPERATION_EVIDENCE_RECEIPT_PATH,
].includes(path)));
const PRE_MISSION_OPERATION_EVIDENCE_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...PRE_PORTABLE_PHASE_HOST_ADVERSARIAL_CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_MISSION_OPERATION_EVIDENCE_V2_BOUNDARY_PATHS,
  missionOperationEvidence: false,
  missionOperationEvidenceFullTests: undefined,
  missionForensicIndex: false,
  missionForensicIndexFullTests: undefined,
});
const PRE_ADAPTER_V2_BOUNDARY_PATHS = Object.freeze(PRE_MISSION_OPERATION_EVIDENCE_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/mission-operation-adapter-v1.json',
  'schemas/mission-operation-adapter.schema.json',
  'schemas/mission-operation-request.schema.json',
  'schemas/mission-operation-receipt.schema.json',
  'src/core/schema-validator.mjs',
  'src/runtime/mission-operation-adapter.mjs',
  'scripts/build-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-mission-operation-adapter-v1-receipt.mjs',
  'tests/mission-operation-adapter-certification.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
  'fixtures/review-mission-operation-adapter-v1.json',
  'scripts/build-review-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-review-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/review-mission-operation-adapter.mjs',
  'tests/review-mission-operation-adapter-certification.test.mjs',
  'tests/review-mission-operation-adapter.test.mjs',
  DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
  'fixtures/revision-mission-operation-adapter-v1.json',
  'scripts/build-revision-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-revision-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/revision-mission-operation-adapter.mjs',
  'tests/revision-mission-operation-adapter-certification.test.mjs',
  'tests/revision-mission-operation-adapter.test.mjs',
  REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
  'fixtures/realm-consequence-mission-operation-adapter-v1.json',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/realm-consequence-mission-operation-adapter.mjs',
  'tests/realm-consequence-mission-operation-adapter-certification.test.mjs',
  'tests/realm-consequence-mission-operation-adapter.test.mjs',
  REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
 ].includes(path)));
const PRE_REVISION_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS = Object.freeze(PRE_MISSION_OPERATION_EVIDENCE_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/revision-mission-operation-adapter-v1.json',
  'scripts/build-revision-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-revision-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/revision-mission-operation-adapter.mjs',
  'tests/revision-mission-operation-adapter-certification.test.mjs',
  'tests/revision-mission-operation-adapter.test.mjs',
  REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
  'fixtures/delegation-mission-operation-adapter-v1.json',
  'scripts/build-delegation-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-delegation-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/delegation-mission-operation-adapter.mjs',
  'tests/delegation-mission-operation-adapter-certification.test.mjs',
  'tests/delegation-mission-operation-adapter.test.mjs',
  DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
  'fixtures/realm-consequence-mission-operation-adapter-v1.json',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/realm-consequence-mission-operation-adapter.mjs',
  'tests/realm-consequence-mission-operation-adapter-certification.test.mjs',
  'tests/realm-consequence-mission-operation-adapter.test.mjs',
  REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
 ].includes(path)));
const PRE_REVIEW_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS = Object.freeze(PRE_REVISION_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/review-mission-operation-adapter-v1.json',
  'scripts/build-review-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-review-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/review-mission-operation-adapter.mjs',
  'tests/review-mission-operation-adapter-certification.test.mjs',
  'tests/review-mission-operation-adapter.test.mjs',
  DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
].includes(path)));
const PRE_REVIEW_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_REVIEW_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS,
  portablePhaseHostAdversarial: false,
  portablePhaseHostAdversarialFullTests: undefined,
  missionForensicIndex: false,
  missionForensicIndexFullTests: undefined,
  missionOperationEvidence: false,
  missionOperationEvidenceFullTests: undefined,
  deferredReviewMissionOperationAdapter: false,
  deferredReviewMissionOperationAdapterFullTests: undefined,
  revisionMissionOperationAdapter: false,
  revisionMissionOperationAdapterFullTests: undefined,
  delegationMissionOperationAdapter: false,
  delegationMissionOperationAdapterFullTests: undefined,
  realmConsequenceMissionOperationAdapter: false,
  realmConsequenceMissionOperationAdapterFullTests: undefined,
});
const PRE_REVISION_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_REVISION_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS,
  portablePhaseHostAdversarial: false,
  portablePhaseHostAdversarialFullTests: undefined,
  missionForensicIndex: false,
  missionForensicIndexFullTests: undefined,
  missionOperationEvidence: false,
  missionOperationEvidenceFullTests: undefined,
  revisionMissionOperationAdapter: false,
  revisionMissionOperationAdapterFullTests: undefined,
  delegationMissionOperationAdapter: false,
  delegationMissionOperationAdapterFullTests: undefined,
  realmConsequenceMissionOperationAdapter: false,
  realmConsequenceMissionOperationAdapterFullTests: undefined,
});
const PRE_DELEGATION_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS = Object.freeze(PRE_MISSION_OPERATION_EVIDENCE_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/delegation-mission-operation-adapter-v1.json',
  'scripts/build-delegation-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-delegation-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/delegation-mission-operation-adapter.mjs',
  'tests/delegation-mission-operation-adapter-certification.test.mjs',
  'tests/delegation-mission-operation-adapter.test.mjs',
  DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
  'fixtures/realm-consequence-mission-operation-adapter-v1.json',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/realm-consequence-mission-operation-adapter.mjs',
  'tests/realm-consequence-mission-operation-adapter-certification.test.mjs',
  'tests/realm-consequence-mission-operation-adapter.test.mjs',
  REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
 ].includes(path)));
const PRE_REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS = Object.freeze(PRE_MISSION_OPERATION_EVIDENCE_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/realm-consequence-mission-operation-adapter-v1.json',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-receipt.mjs',
  'src/runtime/realm-consequence-mission-operation-adapter.mjs',
  'tests/realm-consequence-mission-operation-adapter-certification.test.mjs',
  'tests/realm-consequence-mission-operation-adapter.test.mjs',
  REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
 ].includes(path)));
const PRE_REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS,
  portablePhaseHostAdversarial: false,
  portablePhaseHostAdversarialFullTests: undefined,
  missionForensicIndex: false,
  missionForensicIndexFullTests: undefined,
  missionOperationEvidence: false,
  missionOperationEvidenceFullTests: undefined,
  realmConsequenceMissionOperationAdapter: false,
  realmConsequenceMissionOperationAdapterFullTests: undefined,
});
const PRE_DELEGATION_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_DELEGATION_MISSION_OPERATION_ADAPTER_V2_BOUNDARY_PATHS,
  portablePhaseHostAdversarial: false,
  portablePhaseHostAdversarialFullTests: undefined,
  missionForensicIndex: false,
  missionForensicIndexFullTests: undefined,
  missionOperationEvidence: false,
  missionOperationEvidenceFullTests: undefined,
  delegationMissionOperationAdapter: false,
  delegationMissionOperationAdapterFullTests: undefined,
  realmConsequenceMissionOperationAdapter: false,
  realmConsequenceMissionOperationAdapterFullTests: undefined,
});
const PRE_ADAPTER_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_ADAPTER_V2_BOUNDARY_PATHS,
  portablePhaseHostAdversarial: false,
  portablePhaseHostAdversarialFullTests: undefined,
  missionForensicIndex: false,
  missionForensicIndexFullTests: undefined,
  missionOperationEvidence: false,
  missionOperationEvidenceFullTests: undefined,
  missionOperationAdapter: false,
  missionOperationAdapterFullTests: undefined,
  deferredReviewMissionOperationAdapter: false,
  deferredReviewMissionOperationAdapterFullTests: undefined,
  revisionMissionOperationAdapter: false,
  revisionMissionOperationAdapterFullTests: undefined,
  delegationMissionOperationAdapter: false,
  delegationMissionOperationAdapterFullTests: undefined,
  realmConsequenceMissionOperationAdapter: false,
  realmConsequenceMissionOperationAdapterFullTests: undefined,
});
const PRE_AGENT_PROFILE_V2_BOUNDARY_PATHS = Object.freeze(PRE_ADAPTER_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/agent-profile-contract-v1.json',
  'schemas/godagent-profile.schema.json',
  'src/agent/profile.mjs',
  'src/creation/contracts.mjs',
  'src/skills/capability-policy.mjs',
  'tests/agent-profile-contract-certification.test.mjs',
  'tests/agent-profile-contract.test.mjs',
  AGENT_PROFILE_CONTRACT_RECEIPT_PATH,
].includes(path)));
const PRE_AGENT_PROFILE_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...PRE_ADAPTER_CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_AGENT_PROFILE_V2_BOUNDARY_PATHS,
  agentProfileContract: false,
  agentProfileContractFullTests: undefined,
  missionOperationAdapter: false,
  missionOperationAdapterFullTests: undefined,
  deferredReviewMissionOperationAdapter: false,
  deferredReviewMissionOperationAdapterFullTests: undefined,
});
const PRE_FORENSICS_V2_BOUNDARY_PATHS = Object.freeze(PRE_AGENT_PROFILE_V2_BOUNDARY_PATHS.filter((path) => ![
  'fixtures/mission-program-forensics-v1.json',
  'schemas/mission-program-forensics.schema.json',
  'tests/mission-program-forensics-certification.test.mjs',
  'tests/mission-program-forensics.test.mjs',
  MISSION_PROGRAM_FORENSICS_RECEIPT_PATH,
].includes(path)));
const PRE_FORENSICS_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...PRE_AGENT_PROFILE_CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_FORENSICS_V2_BOUNDARY_PATHS,
  missionProgramForensics: false,
  missionProgramForensicsFullTests: undefined,
});
const PRE_FORENSICS_WITH_AGENT_PROFILE_CURRENT_HEAD_V2_PROFILE = Object.freeze({
  ...PRE_ADAPTER_CURRENT_HEAD_V2_PROFILE,
  boundaryPaths: PRE_ADAPTER_V2_BOUNDARY_PATHS.filter((path) => ![
    'fixtures/mission-program-forensics-v1.json',
    'schemas/mission-program-forensics.schema.json',
    'tests/mission-program-forensics-certification.test.mjs',
    'tests/mission-program-forensics.test.mjs',
    MISSION_PROGRAM_FORENSICS_RECEIPT_PATH,
  ].includes(path)),
  missionProgramForensics: false,
  missionProgramForensicsFullTests: undefined,
});

function cleanGitEnvironment() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return env;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} fields are invalid`);
}

function equal(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is not a SHA-256 digest`);
}

function requireCommit(value, label) {
  if (typeof value !== 'string' || !COMMIT.test(value)) throw new Error(`${label} is not a full commit id`);
}

function requireRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')
      || value.startsWith('/') || /^[a-zA-Z]:/.test(value) || /[\0\r\n?#]/.test(value)) {
    throw new Error(`${label} must be repository-relative`);
  }
  const parts = value.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    throw new Error(`${label} must be repository-relative`);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function requireCanonicalJsonText(text, value, label) {
  if (text !== `${canonicalJson(value)}\n`) throw new Error(`${label} is not canonical JSON`);
}

async function gitText(repositoryRoot, args, label) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      env: cleanGitEnvironment(),
    });
    return stdout;
  } catch {
    throw new Error(`${label} is unavailable`);
  }
}

async function resolveCommit(repositoryRoot, ref, label) {
  const commit = (await gitText(
    repositoryRoot,
    ['rev-parse', '--verify', `${ref}^{commit}`],
    `${label} reference`,
  )).trim();
  requireCommit(commit, `${label} resolved commit`);
  return commit;
}

async function requireCommitObject(repositoryRoot, commit, label) {
  requireCommit(commit, label);
  await gitText(repositoryRoot, ['cat-file', '-e', `${commit}^{commit}`], `${label} object`);
}

async function isAncestor(repositoryRoot, ancestor, descendant, label) {
  requireCommit(ancestor, `${label} ancestor`);
  requireCommit(descendant, `${label} descendant`);
  try {
    await execFileAsync('git', ['-C', repositoryRoot, 'merge-base', '--is-ancestor', ancestor, descendant], {
      windowsHide: true,
      env: cleanGitEnvironment(),
    });
  } catch {
    throw new Error(`${label} is not an ancestor`);
  }
}

async function readBlob(repositoryRoot, commit, path, label) {
  requireRelativePath(path, `${label} path`);
  return gitText(repositoryRoot, ['show', `${commit}:${path}`], label);
}

async function hashBlob(repositoryRoot, commit, path, label) {
  return sha256Text(await readBlob(repositoryRoot, commit, path, label));
}

function parseSdkExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/\bexport\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/\bexport\s*\{([\s\S]*?)\}\s*from\s*/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

function referenceRows(pin) {
  const rows = [];
  for (const [key, role] of ROOT_REFERENCES) {
    const reference = pin?.[key];
    if (!reference) throw new Error(`Godskills release pin lacks ${key}`);
    rows.push({ role, path: reference.path, sha256: reference.sha256 });
  }
  if (pin.activation !== undefined) {
    for (const [key, role] of ACTIVATION_REFERENCES) {
      const reference = pin.activation?.[key];
      if (!reference) throw new Error(`Godskills activation pin lacks ${key}`);
      rows.push({ role, path: reference.path, sha256: reference.sha256 });
    }
    for (const reference of pin.activation.dependencies ?? []) {
      rows.push({ role: 'activation-dependency', path: reference.path, sha256: reference.sha256 });
    }
    for (const [key, role] of [['request', 'activation-request-schema'], ['result', 'activation-result-schema']]) {
      const reference = pin.activation.schemas?.[key];
      if (!reference) throw new Error(`Godskills activation pin lacks ${key} schema`);
      rows.push({ role, path: reference.path, sha256: reference.sha256 });
    }
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path) || left.role.localeCompare(right.role));
}

function assertReferenceRows(rows, pin, label) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${label} are required`);
  const expected = referenceRows(pin);
  if (!equal(rows, expected)) throw new Error(`${label} do not match the exact release pin`);
  const paths = rows.map(({ path }) => path);
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contain duplicate paths`);
  for (const row of rows) {
    requireRelativePath(row.path, `${label} path`);
    requireDigest(row.sha256, `${label} digest`);
  }
}

function requireRootIdentity(value, key, label) {
  const expected = ROOT_IDENTITY[key];
  if (!value || typeof value !== 'object') throw new Error(`${label} identity is missing`);
  for (const [field, wanted] of Object.entries(expected)) {
    if (value[field] !== wanted) throw new Error(`${label} identity mismatch`);
  }
}

function requireActivationIdentity(value, key, label) {
  const expected = ACTIVATION_IDENTITY[key];
  if (!value || typeof value !== 'object') throw new Error(`${label} identity is missing`);
  for (const [field, wanted] of Object.entries(expected)) {
    if (value[field] !== wanted) throw new Error(`${label} identity mismatch`);
  }
}

function validateTestRuns(testRuns) {
  exactKeys(testRuns, ['godagentsFocused', 'godagentsFull', 'godskillsFocused'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is not passing`);
    }
  }
}

function validateProofLimits(proofLimits) {
  if (!Array.isArray(proofLimits) || !equal(proofLimits, [...PROOF_LIMITS])) {
    throw new Error('proof limits are incomplete or reordered');
  }
}

async function verifyPinArtifacts(repositoryRoot, commit, profile, label) {
  if (!profile || typeof profile !== 'object') throw new Error(`${label} profile is missing`);
  if (profile.pin?.adapterProtocol !== ADAPTER_PROTOCOL) throw new Error(`${label} adapter protocol is unsupported`);
  assertReferenceRows(profile.artifactRows, profile.pin, `${label} artifact rows`);
  for (const row of profile.artifactRows) {
    const actual = await hashBlob(repositoryRoot, commit, row.path, `${label} ${row.path}`);
    if (actual !== row.sha256) throw new Error(`${label} artifact digest mismatch: ${row.path}`);
  }
  for (const [key, _role] of ROOT_REFERENCES) {
    const reference = profile.pin[key];
    const value = parseJson(
      await readBlob(repositoryRoot, commit, reference.path, `${label} ${key}`),
      `${label} ${key}`,
    );
    requireRootIdentity(value, key, `${label} ${key}`);
  }
  const manifest = parseJson(
    await readBlob(repositoryRoot, commit, profile.pin.portableManifest.path, `${label} portable manifest`),
    `${label} portable manifest`,
  );
  if (manifest.manifestId !== 'portable-capabilities-v1'
      || manifest.status !== 'certified-local-artifacts'
      || !Array.isArray(manifest.capabilities)
      || manifest.capabilities.length !== 44) {
    throw new Error(`${label} portable manifest count is invalid`);
  }
  if (profile.pin.activation !== undefined) {
    if (profile.pin.activation.protocolId !== ACTIVATION_PROTOCOL) {
      throw new Error(`${label} activation protocol is unsupported`);
    }
    for (const [key] of Object.entries(ACTIVATION_IDENTITY)) {
      const reference = profile.pin.activation[key];
      const value = parseJson(
        await readBlob(repositoryRoot, commit, reference.path, `${label} ${key}`),
        `${label} ${key}`,
      );
      requireActivationIdentity(value, key, `${label} ${key}`);
    }
  }
}

function validateBoundaryEvidence(boundaries, evidence, integration) {
  exactKeys(boundaries, ['noAuthorityExpansion', 'noImplicitActivation'], 'boundary evidence');
  exactKeys(boundaries.noImplicitActivation, [
    'canonicalHostActivation', 'completeActivationTuple', 'evidencePaths',
    'incompleteTupleFailsClosed', 'legacyOperationPreserved',
  ], 'implicit activation boundary');
  if (boundaries.noImplicitActivation.canonicalHostActivation !== 'absent'
      || !equal(boundaries.noImplicitActivation.completeActivationTuple, [
        'verified-root', 'classifier', 'transport',
      ])
      || boundaries.noImplicitActivation.incompleteTupleFailsClosed !== true
      || boundaries.noImplicitActivation.legacyOperationPreserved !== true
      || !equal(boundaries.noImplicitActivation.evidencePaths, [
        'src/skills/mission-binder.mjs',
        'tests/godskills-adaptive-activation.test.mjs',
      ])) {
    throw new Error('implicit activation boundary is not exact');
  }
  exactKeys(boundaries.noAuthorityExpansion, [
    'authorityExpansions', 'evidencePaths', 'hostCeilingsRemainAuthoritative',
    'unselectedBodyLoads',
  ], 'authority boundary');
  if (boundaries.noAuthorityExpansion.authorityExpansions !== 0
      || boundaries.noAuthorityExpansion.unselectedBodyLoads !== 0
      || boundaries.noAuthorityExpansion.hostCeilingsRemainAuthoritative !== true
      || !equal(boundaries.noAuthorityExpansion.evidencePaths, [
        'src/skills/godskills-adapter.mjs',
        'src/skills/mission-binder.mjs',
        'tests/godskills-mission-binder.test.mjs',
        'tests/godskills-v3-integration.test.mjs',
        INTEGRATION_RECEIPT_PATH,
      ])) {
    throw new Error('authority boundary is not exact');
  }
  if (integration.metrics.authorityExpansions !== 0
      || integration.metrics.unselectedBodyLoads !== 0) {
    throw new Error('integration evidence reports an authority or body-load expansion');
  }
  const boundEvidencePaths = new Set([
    ...evidence.boundaryFiles.map(({ path }) => path),
    evidence.integrationReceipt.path,
  ]);
  for (const path of [
    ...boundaries.noImplicitActivation.evidencePaths,
    ...boundaries.noAuthorityExpansion.evidencePaths,
  ]) {
    if (!boundEvidencePaths.has(path)) {
      throw new Error(`boundary evidence path is not bound: ${path}`);
    }
  }
}

function validateReceiptShape(receipt, { protocolId, status, profile = LEGACY_PROFILE }) {
  exactKeys(receipt, [
    'schemaVersion', 'status', 'protocolId', 'source', 'godagents', 'godskills',
    'boundaries', 'proofLimits', 'testRuns', 'receiptDigest',
  ], 'cross-repository certificate');
  if (receipt.schemaVersion !== 1 || receipt.status !== status
      || receipt.protocolId !== protocolId) {
    throw new Error('cross-repository certificate identity is invalid');
  }
  requireDigest(receipt.receiptDigest, 'cross-repository certificate receipt digest');
  const { receiptDigest, ...unsigned } = receipt;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('cross-repository certificate receipt digest mismatch');
  exactKeys(receipt.source, ['godagents', 'godskills'], 'certificate source');
  for (const [name, source] of Object.entries(receipt.source)) {
    exactKeys(source, ['commit', 'refs', 'repository'], `${name} source`);
    requireCommit(source.commit, `${name} source commit`);
    if (source.repository !== `eternities-${name}`) throw new Error(`${name} repository identity mismatch`);
    exactKeys(source.refs, ['main', 'originMain'], `${name} source refs`);
    requireCommit(source.refs.main, `${name} main ref`);
    requireCommit(source.refs.originMain, `${name} origin main ref`);
  }
  validateTestRuns(receipt.testRuns);
  validateProofLimits(receipt.proofLimits);
}

async function verifyAppendOnlyGodagentsTip(repositoryRoot, receipt, source, profile) {
  const [main, originMain] = await Promise.all([
    resolveCommit(repositoryRoot, 'main', 'Godagents current main'),
    resolveCommit(repositoryRoot, 'origin/main', 'Godagents current origin main'),
  ]);
  if (main !== originMain) throw new Error('Godagents append-only tip refs are not reconciled');
  await isAncestor(repositoryRoot, source.commit, main, 'Godagents append-only source');
  const changed = (await gitText(
    repositoryRoot,
    ['diff', '--name-only', '--no-renames', `${source.commit}..${main}`],
    'Godagents append-only diff',
  )).split(/\r?\n/).filter(Boolean).sort();
  const allowed = [...profile.appendOnlyPaths].sort();
  if (changed.length === 0 || changed.some((path) => !allowed.includes(path))) {
    throw new Error('Godagents current tip contains changes outside the v2 append-only paths');
  }
  const artifactText = await readBlob(
    repositoryRoot,
    main,
    profile.artifactPath,
    'Godagents v2 certificate artifact',
  );
  const artifact = parseJson(artifactText, 'Godagents v2 certificate artifact');
  requireCanonicalJsonText(artifactText, artifact, 'Godagents v2 certificate artifact');
  if (!equal(artifact, receipt)) throw new Error('Godagents v2 certificate artifact does not match receipt');
  const certificationText = await readBlob(
    repositoryRoot,
    main,
    profile.certificationPath,
    'Godagents v2 certification document',
  );
  if (certificationText !== profile.certificationDocument) {
    throw new Error('Godagents v2 certification document is not canonical');
  }
}

async function verifySdk(repositoryRoot, commit, sdk, profile = LEGACY_PROFILE) {
  exactKeys(sdk, profile.portableConformance
    ? ['entrypoint', 'packageExports', 'packageExportsDigest', 'packageSha256', 'rootExports', 'supportedAdapterProtocols']
    : ['entrypoint', 'packageExports', 'packageExportsDigest', 'packageSha256', 'rootExports'], 'SDK surface');
  if (sdk.entrypoint.path !== SDK_ENTRYPOINT_PATH) throw new Error('SDK entrypoint path mismatch');
  requireDigest(sdk.entrypoint.sha256, 'SDK entrypoint digest');
  requireDigest(sdk.packageSha256, 'SDK package digest');
  requireDigest(sdk.packageExportsDigest, 'SDK export-map digest');
  const packageText = await readBlob(repositoryRoot, commit, SDK_PACKAGE_PATH, 'SDK package');
  const packageValue = parseJson(packageText, 'SDK package');
  if (sha256Text(packageText) !== sdk.packageSha256) throw new Error('SDK package digest mismatch');
  if (packageValue.exports === undefined || !equal(packageValue.exports, sdk.packageExports)) {
    throw new Error('SDK export map mismatch');
  }
  if (sha256Value(packageValue.exports) !== sdk.packageExportsDigest) throw new Error('SDK export-map digest mismatch');
  if (!equal(packageValue.exports, profile.packageExports)) {
    throw new Error('SDK export map is not the declared closed map');
  }
  const source = await readBlob(repositoryRoot, commit, SDK_ENTRYPOINT_PATH, 'SDK entrypoint');
  if (sha256Text(source) !== sdk.entrypoint.sha256) throw new Error('SDK entrypoint digest mismatch');
  if (!equal(parseSdkExports(source), sdk.rootExports) || !equal(sdk.rootExports, profile.sdkExports)) {
    throw new Error('SDK root export set mismatch');
  }
  if (profile.portableConformance) {
    const supportedAdapterProtocols = profile.supportedAdapterProtocols ?? [PORTABLE_CONFORMANCE_PROTOCOL];
    if (!equal(sdk.supportedAdapterProtocols, supportedAdapterProtocols)) {
      throw new Error('SDK supported adapter protocol set mismatch');
    }
    if (!source.includes(`'${PORTABLE_CONFORMANCE_PROTOCOL}'`)
        && !source.includes(`"${PORTABLE_CONFORMANCE_PROTOCOL}"`)) {
      throw new Error('SDK portable adapter protocol declaration is missing');
    }
    if (profile.portableRealmConsequenceSdk
        && !source.includes(`'${PORTABLE_REALM_CONSEQUENCE_SDK_PROTOCOL}'`)
        && !source.includes(`"${PORTABLE_REALM_CONSEQUENCE_SDK_PROTOCOL}"`)) {
      throw new Error('SDK Realm consequence adapter protocol declaration is missing');
    }
  }
}

async function verifyHostRelease(repositoryRoot, commit, hostRelease) {
  exactKeys(hostRelease, ['path', 'pin', 'pinDigest', 'repositoryRoot', 'sha256'], 'host release input');
  if (hostRelease.path !== HOST_POLICY_PATH) throw new Error('host release path mismatch');
  requireDigest(hostRelease.sha256, 'host policy digest');
  requireDigest(hostRelease.pinDigest, 'host release pin digest');
  const text = await readBlob(repositoryRoot, commit, hostRelease.path, 'host policy');
  if (sha256Text(text) !== hostRelease.sha256) throw new Error('host policy digest mismatch');
  const policy = parseJson(text, 'host policy');
  const actual = policy?.runtime?.godskillsRelease;
  if (!actual || !equal(actual, hostRelease.pin)) throw new Error('host release pin mismatch');
  if (hostRelease.repositoryRoot !== actual.repositoryRoot
      || hostRelease.pinDigest !== sha256Value(actual)) {
    throw new Error('host release identity mismatch');
  }
  if (actual.activation !== undefined) throw new Error('canonical host unexpectedly enables adaptive activation');
  return policy;
}

async function verifyAdaptiveSource(repositoryRoot, commit, source, godskillsRoot, godskillsCommit) {
  exactKeys(source, ['path', 'sha256', 'sourceCommit'], 'adaptive release source');
  if (source.path !== ADAPTIVE_SOURCE_PATH) throw new Error('adaptive release source path mismatch');
  requireDigest(source.sha256, 'adaptive release source digest');
  requireCommit(source.sourceCommit, 'adaptive release source commit');
  const text = await readBlob(repositoryRoot, commit, source.path, 'adaptive release source');
  if (sha256Text(text) !== source.sha256) throw new Error('adaptive release source digest mismatch');
  const match = text.match(/pinnedGodskillsReviewSourceCommit\s*=\s*['"]([a-f0-9]{40})['"]/);
  if (!match || match[1] !== source.sourceCommit) throw new Error('adaptive release source commit mismatch');
  await requireCommitObject(godskillsRoot, source.sourceCommit, 'adaptive release source commit');
  await isAncestor(godskillsRoot, source.sourceCommit, godskillsCommit, 'adaptive release source commit');
}

async function verifyBeacon(godskillsRoot, godskillsCommit, beacon) {
  exactKeys(beacon, ['snapshot'], 'Beacon evidence');
  exactKeys(beacon.snapshot, [
    'currentHeadInterpretation', 'gitCommit', 'id', 'path', 'releaseReceiptPath',
    'releaseReceiptSha256', 'schemaVersion', 'sha256', 'status',
  ], 'Beacon snapshot');
  const snapshot = beacon.snapshot;
  if (snapshot.path !== BEACON_SNAPSHOT_PATH || snapshot.schemaVersion !== 1
      || snapshot.id !== 'eternities-beacon-release-v1-snapshot'
      || snapshot.status !== 'frozen-historical-snapshot'
      || snapshot.currentHeadInterpretation !== 'historical receipt evidence only; current-head certification requires a new receipt') {
    throw new Error('Beacon snapshot identity mismatch');
  }
  requireDigest(snapshot.sha256, 'Beacon snapshot digest');
  requireDigest(snapshot.releaseReceiptSha256, 'Beacon release receipt digest');
  requireCommit(snapshot.gitCommit, 'Beacon historical commit');
  const snapshotText = await readBlob(godskillsRoot, godskillsCommit, snapshot.path, 'Beacon snapshot');
  if (sha256Text(snapshotText) !== snapshot.sha256) throw new Error('Beacon snapshot digest mismatch');
  const actual = parseJson(snapshotText, 'Beacon snapshot');
  if (!equal(actual, {
    schemaVersion: snapshot.schemaVersion,
    id: snapshot.id,
    status: snapshot.status,
    releaseReceiptPath: snapshot.releaseReceiptPath,
    releaseReceiptSha256: snapshot.releaseReceiptSha256,
    gitCommit: snapshot.gitCommit,
    currentHeadInterpretation: snapshot.currentHeadInterpretation,
  })) throw new Error('Beacon snapshot content mismatch');
  await requireCommitObject(godskillsRoot, snapshot.gitCommit, 'Beacon historical commit');
  await isAncestor(godskillsRoot, snapshot.gitCommit, godskillsCommit, 'Beacon historical commit');
  const releaseText = await readBlob(
    godskillsRoot,
    snapshot.gitCommit,
    snapshot.releaseReceiptPath,
    'Beacon historical release receipt',
  );
  if (sha256Text(releaseText) !== snapshot.releaseReceiptSha256) {
    throw new Error('Beacon historical release receipt digest mismatch');
  }
}

async function verifyPortableConformanceEvidence(repositoryRoot, commit, evidence) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'portable conformance evidence');
  if (evidence.certificationId !== PORTABLE_CONFORMANCE_CERTIFICATION_ID
      || evidence.path !== PORTABLE_CONFORMANCE_RECEIPT_PATH) {
    throw new Error('portable conformance evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'portable conformance fixture digest');
  requireDigest(evidence.receiptDigest, 'portable conformance receipt digest');
  requireDigest(evidence.sha256, 'portable conformance receipt file digest');
  requireCommit(evidence.sourceCommit, 'portable conformance source commit');
  const text = await readBlob(repositoryRoot, commit, evidence.path, 'portable conformance receipt');
  if (sha256Text(text) !== evidence.sha256) throw new Error('portable conformance receipt file digest mismatch');
  const receipt = parseJson(text, 'portable conformance receipt');
  requireCanonicalJsonText(text, receipt, 'portable conformance receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== PORTABLE_CONFORMANCE_CERTIFICATION_ID
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest) {
    throw new Error('portable conformance receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'portable conformance source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'portable conformance source commit');
}

async function verifyPortableRealmConsequenceSdkEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'portable Realm consequence SDK evidence');
  if (evidence.certificationId !== PORTABLE_REALM_CONSEQUENCE_SDK_CERTIFICATION_ID
      || evidence.path !== PORTABLE_REALM_CONSEQUENCE_SDK_RECEIPT_PATH) {
    throw new Error('portable Realm consequence SDK evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'portable Realm consequence SDK fixture digest');
  requireDigest(evidence.receiptDigest, 'portable Realm consequence SDK receipt digest');
  requireDigest(evidence.sha256, 'portable Realm consequence SDK receipt file digest');
  requireCommit(evidence.sourceCommit, 'portable Realm consequence SDK source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.portableRealmConsequenceSdkFullTests) {
    throw new Error('portable Realm consequence SDK full test evidence mismatch');
  }
  const text = await readBlob(repositoryRoot, commit, evidence.path, 'portable Realm consequence SDK receipt');
  if (sha256Text(text) !== evidence.sha256) throw new Error('portable Realm consequence SDK receipt file digest mismatch');
  const receipt = parseJson(text, 'portable Realm consequence SDK receipt');
  requireCanonicalJsonText(text, receipt, 'portable Realm consequence SDK receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== PORTABLE_REALM_CONSEQUENCE_SDK_CERTIFICATION_ID
      || receipt.protocolId !== PORTABLE_REALM_CONSEQUENCE_SDK_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('portable Realm consequence SDK receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'portable Realm consequence SDK source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'portable Realm consequence SDK source commit');
}

async function verifyAdmittedPortableIdentityLauncherEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'admitted portable identity launcher evidence');
  if (evidence.certificationId !== ADMITTED_PORTABLE_IDENTITY_LAUNCHER_CERTIFICATION_ID
      || evidence.path !== ADMITTED_PORTABLE_IDENTITY_LAUNCHER_RECEIPT_PATH) {
    throw new Error('admitted portable identity launcher evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'admitted portable identity launcher fixture digest');
  requireDigest(evidence.receiptDigest, 'admitted portable identity launcher receipt digest');
  requireDigest(evidence.sha256, 'admitted portable identity launcher receipt file digest');
  requireCommit(evidence.sourceCommit, 'admitted portable identity launcher source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.admittedPortableIdentityLauncherFullTests) {
    throw new Error('admitted portable identity launcher full test evidence mismatch');
  }
  const text = await readBlob(
    repositoryRoot,
    commit,
    evidence.path,
    'admitted portable identity launcher receipt',
  );
  if (sha256Text(text) !== evidence.sha256) {
    throw new Error('admitted portable identity launcher receipt file digest mismatch');
  }
  const receipt = parseJson(text, 'admitted portable identity launcher receipt');
  requireCanonicalJsonText(text, receipt, 'admitted portable identity launcher receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== ADMITTED_PORTABLE_IDENTITY_LAUNCHER_CERTIFICATION_ID
      || receipt.protocolId !== ADMITTED_PORTABLE_IDENTITY_LAUNCHER_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('admitted portable identity launcher receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'admitted portable identity launcher source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'admitted portable identity launcher source commit');
}

async function verifyMissionProgramEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'mission program evidence');
  if (evidence.certificationId !== MISSION_PROGRAM_CERTIFICATION_ID
      || evidence.path !== MISSION_PROGRAM_RECEIPT_PATH) {
    throw new Error('mission program evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'mission program fixture digest');
  requireDigest(evidence.receiptDigest, 'mission program receipt digest');
  requireDigest(evidence.sha256, 'mission program receipt file digest');
  requireCommit(evidence.sourceCommit, 'mission program source commit');
  if (!Number.isInteger(evidence.fullTests) || evidence.fullTests !== profile.missionProgramFullTests) {
    throw new Error('mission program full test evidence mismatch');
  }
  const text = await readBlob(repositoryRoot, commit, evidence.path, 'mission program receipt');
  if (sha256Text(text) !== evidence.sha256) throw new Error('mission program receipt file digest mismatch');
  const receipt = parseJson(text, 'mission program receipt');
  requireCanonicalJsonText(text, receipt, 'mission program receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== MISSION_PROGRAM_CERTIFICATION_ID
      || receipt.protocolId !== MISSION_PROGRAM_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('mission program receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'mission program source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'mission program source commit');
}

async function verifyMissionProgramForensicsEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'mission program forensics evidence');
  if (evidence.certificationId !== MISSION_PROGRAM_FORENSICS_CERTIFICATION_ID
      || evidence.path !== MISSION_PROGRAM_FORENSICS_RECEIPT_PATH) {
    throw new Error('mission program forensics evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'mission program forensics fixture digest');
  requireDigest(evidence.receiptDigest, 'mission program forensics receipt digest');
  requireDigest(evidence.sha256, 'mission program forensics receipt file digest');
  requireCommit(evidence.sourceCommit, 'mission program forensics source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.missionProgramForensicsFullTests) {
    throw new Error('mission program forensics full test evidence mismatch');
  }
  const text = await readBlob(repositoryRoot, commit, evidence.path, 'mission program forensics receipt');
  if (sha256Text(text) !== evidence.sha256) throw new Error('mission program forensics receipt file digest mismatch');
  const receipt = parseJson(text, 'mission program forensics receipt');
  requireCanonicalJsonText(text, receipt, 'mission program forensics receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== MISSION_PROGRAM_FORENSICS_CERTIFICATION_ID
      || receipt.protocolId !== MISSION_PROGRAM_FORENSICS_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('mission program forensics receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'mission program forensics source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'mission program forensics source commit');
}

async function verifyAgentProfileContractEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'agent profile contract evidence');
  if (evidence.certificationId !== AGENT_PROFILE_CONTRACT_CERTIFICATION_ID
      || evidence.path !== AGENT_PROFILE_CONTRACT_RECEIPT_PATH) {
    throw new Error('agent profile contract evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'agent profile fixture digest');
  requireDigest(evidence.receiptDigest, 'agent profile receipt digest');
  requireDigest(evidence.sha256, 'agent profile receipt file digest');
  requireCommit(evidence.sourceCommit, 'agent profile source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.agentProfileContractFullTests) {
    throw new Error('agent profile contract full test evidence mismatch');
  }
  const text = await readBlob(repositoryRoot, commit, evidence.path, 'agent profile contract receipt');
  if (sha256Text(text) !== evidence.sha256) throw new Error('agent profile contract receipt file digest mismatch');
  const receipt = parseJson(text, 'agent profile contract receipt');
  requireCanonicalJsonText(text, receipt, 'agent profile contract receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== AGENT_PROFILE_CONTRACT_CERTIFICATION_ID
      || receipt.protocolId !== AGENT_PROFILE_CONTRACT_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('agent profile contract receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'agent profile contract source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'agent profile contract source commit');
}

async function verifyMissionOperationAdapterEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'mission operation adapter evidence');
  if (evidence.certificationId !== MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || evidence.path !== MISSION_OPERATION_ADAPTER_RECEIPT_PATH) {
    throw new Error('mission operation adapter evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'mission operation adapter fixture digest');
  requireDigest(evidence.receiptDigest, 'mission operation adapter receipt digest');
  requireDigest(evidence.sha256, 'mission operation adapter receipt file digest');
  requireCommit(evidence.sourceCommit, 'mission operation adapter source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.missionOperationAdapterFullTests) {
    throw new Error('mission operation adapter full test evidence mismatch');
  }
  const text = await readBlob(repositoryRoot, commit, evidence.path, 'mission operation adapter receipt');
  if (sha256Text(text) !== evidence.sha256) throw new Error('mission operation adapter receipt file digest mismatch');
  const receipt = parseJson(text, 'mission operation adapter receipt');
  requireCanonicalJsonText(text, receipt, 'mission operation adapter receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || receipt.protocolId !== MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('mission operation adapter receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'mission operation adapter source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'mission operation adapter source commit');
}

async function verifyDeferredReviewMissionOperationAdapterEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'deferred review mission operation adapter evidence');
  if (evidence.certificationId !== DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || evidence.path !== DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH) {
    throw new Error('deferred review mission operation adapter evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'deferred review mission operation adapter fixture digest');
  requireDigest(evidence.receiptDigest, 'deferred review mission operation adapter receipt digest');
  requireDigest(evidence.sha256, 'deferred review mission operation adapter receipt file digest');
  requireCommit(evidence.sourceCommit, 'deferred review mission operation adapter source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.deferredReviewMissionOperationAdapterFullTests) {
    throw new Error('deferred review mission operation adapter full test evidence mismatch');
  }
  const text = await readBlob(
    repositoryRoot,
    commit,
    evidence.path,
    'deferred review mission operation adapter receipt',
  );
  if (sha256Text(text) !== evidence.sha256) {
    throw new Error('deferred review mission operation adapter receipt file digest mismatch');
  }
  const receipt = parseJson(text, 'deferred review mission operation adapter receipt');
  requireCanonicalJsonText(text, receipt, 'deferred review mission operation adapter receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || receipt.protocolId !== DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('deferred review mission operation adapter receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'deferred review mission operation adapter source commit');
  await isAncestor(
    repositoryRoot,
    evidence.sourceCommit,
    commit,
    'deferred review mission operation adapter source commit',
  );
}

async function verifyRevisionMissionOperationAdapterEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'revision mission operation adapter evidence');
  if (evidence.certificationId !== REVISION_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || evidence.path !== REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH) {
    throw new Error('revision mission operation adapter evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'revision mission operation adapter fixture digest');
  requireDigest(evidence.receiptDigest, 'revision mission operation adapter receipt digest');
  requireDigest(evidence.sha256, 'revision mission operation adapter receipt file digest');
  requireCommit(evidence.sourceCommit, 'revision mission operation adapter source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.revisionMissionOperationAdapterFullTests) {
    throw new Error('revision mission operation adapter full test evidence mismatch');
  }
  const text = await readBlob(
    repositoryRoot,
    commit,
    evidence.path,
    'revision mission operation adapter receipt',
  );
  if (sha256Text(text) !== evidence.sha256) {
    throw new Error('revision mission operation adapter receipt file digest mismatch');
  }
  const receipt = parseJson(text, 'revision mission operation adapter receipt');
  requireCanonicalJsonText(text, receipt, 'revision mission operation adapter receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== REVISION_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || receipt.protocolId !== REVISION_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('revision mission operation adapter receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'revision mission operation adapter source commit');
  await isAncestor(
    repositoryRoot,
    evidence.sourceCommit,
    commit,
    'revision mission operation adapter source commit',
  );
}

async function verifyDelegationMissionOperationAdapterEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'delegation mission operation adapter evidence');
  if (evidence.certificationId !== DELEGATION_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || evidence.path !== DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH) {
    throw new Error('delegation mission operation adapter evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'delegation mission operation adapter fixture digest');
  requireDigest(evidence.receiptDigest, 'delegation mission operation adapter receipt digest');
  requireDigest(evidence.sha256, 'delegation mission operation adapter receipt file digest');
  requireCommit(evidence.sourceCommit, 'delegation mission operation adapter source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.delegationMissionOperationAdapterFullTests) {
    throw new Error('delegation mission operation adapter full test evidence mismatch');
  }
  const text = await readBlob(
    repositoryRoot,
    commit,
    evidence.path,
    'delegation mission operation adapter receipt',
  );
  if (sha256Text(text) !== evidence.sha256) {
    throw new Error('delegation mission operation adapter receipt file digest mismatch');
  }
  const receipt = parseJson(text, 'delegation mission operation adapter receipt');
  requireCanonicalJsonText(text, receipt, 'delegation mission operation adapter receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== DELEGATION_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || receipt.protocolId !== DELEGATION_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('delegation mission operation adapter receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'delegation mission operation adapter source commit');
  await isAncestor(
    repositoryRoot,
    evidence.sourceCommit,
    commit,
    'delegation mission operation adapter source commit',
  );
}

async function verifyRealmConsequenceMissionOperationAdapterEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'Realm consequence mission operation adapter evidence');
  if (evidence.certificationId !== REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || evidence.path !== REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH) {
    throw new Error('Realm consequence mission operation adapter evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'Realm consequence mission operation adapter fixture digest');
  requireDigest(evidence.receiptDigest, 'Realm consequence mission operation adapter receipt digest');
  requireDigest(evidence.sha256, 'Realm consequence mission operation adapter receipt file digest');
  requireCommit(evidence.sourceCommit, 'Realm consequence mission operation adapter source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.realmConsequenceMissionOperationAdapterFullTests) {
    throw new Error('Realm consequence mission operation adapter full test evidence mismatch');
  }
  const text = await readBlob(
    repositoryRoot,
    commit,
    evidence.path,
    'Realm consequence mission operation adapter receipt',
  );
  if (sha256Text(text) !== evidence.sha256) {
    throw new Error('Realm consequence mission operation adapter receipt file digest mismatch');
  }
  const receipt = parseJson(text, 'Realm consequence mission operation adapter receipt');
  requireCanonicalJsonText(text, receipt, 'Realm consequence mission operation adapter receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_CERTIFICATION_ID
      || receipt.protocolId !== REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('Realm consequence mission operation adapter receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'Realm consequence mission operation adapter source commit');
  await isAncestor(
    repositoryRoot,
    evidence.sourceCommit,
    commit,
    'Realm consequence mission operation adapter source commit',
  );
}

async function verifyMissionOperationEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'mission operation evidence projection evidence');
  if (evidence.certificationId !== MISSION_OPERATION_EVIDENCE_CERTIFICATION_ID
      || evidence.path !== MISSION_OPERATION_EVIDENCE_RECEIPT_PATH) {
    throw new Error('mission operation evidence projection evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'mission operation evidence projection fixture digest');
  requireDigest(evidence.receiptDigest, 'mission operation evidence projection receipt digest');
  requireDigest(evidence.sha256, 'mission operation evidence projection receipt file digest');
  requireCommit(evidence.sourceCommit, 'mission operation evidence projection source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.missionOperationEvidenceFullTests) {
    throw new Error('mission operation evidence projection full test evidence mismatch');
  }
  const text = await readBlob(
    repositoryRoot,
    commit,
    evidence.path,
    'mission operation evidence projection receipt',
  );
  if (sha256Text(text) !== evidence.sha256) {
    throw new Error('mission operation evidence projection receipt file digest mismatch');
  }
  const receipt = parseJson(text, 'mission operation evidence projection receipt');
  requireCanonicalJsonText(text, receipt, 'mission operation evidence projection receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== MISSION_OPERATION_EVIDENCE_CERTIFICATION_ID
      || receipt.protocolId !== MISSION_OPERATION_EVIDENCE_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('mission operation evidence projection receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'mission operation evidence projection source commit');
  await isAncestor(
    repositoryRoot,
    evidence.sourceCommit,
    commit,
    'mission operation evidence projection source commit',
  );
}

async function verifyMissionForensicIndexEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'mission forensic index evidence');
  if (evidence.certificationId !== MISSION_FORENSIC_INDEX_CERTIFICATION_ID
      || evidence.path !== MISSION_FORENSIC_INDEX_RECEIPT_PATH) {
    throw new Error('mission forensic index evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'mission forensic index fixture digest');
  requireDigest(evidence.receiptDigest, 'mission forensic index receipt digest');
  requireDigest(evidence.sha256, 'mission forensic index receipt file digest');
  requireCommit(evidence.sourceCommit, 'mission forensic index source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.missionForensicIndexFullTests) {
    throw new Error('mission forensic index full test evidence mismatch');
  }
  const text = await readBlob(repositoryRoot, commit, evidence.path, 'mission forensic index receipt');
  if (sha256Text(text) !== evidence.sha256) throw new Error('mission forensic index receipt file digest mismatch');
  const receipt = parseJson(text, 'mission forensic index receipt');
  requireCanonicalJsonText(text, receipt, 'mission forensic index receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== MISSION_FORENSIC_INDEX_CERTIFICATION_ID
      || receipt.protocolId !== MISSION_FORENSIC_INDEX_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('mission forensic index receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'mission forensic index source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'mission forensic index source commit');
}

async function verifyPortablePhaseHostAdversarialEvidence(repositoryRoot, commit, evidence, profile) {
  exactKeys(evidence, [
    'certificationId', 'fixtureDigest', 'fullTests', 'path', 'receiptDigest', 'sha256', 'sourceCommit',
  ], 'portable phase-host adversarial evidence');
  if (evidence.certificationId !== PORTABLE_PHASE_HOST_ADVERSARIAL_CERTIFICATION_ID
      || evidence.path !== PORTABLE_PHASE_HOST_ADVERSARIAL_RECEIPT_PATH) {
    throw new Error('portable phase-host adversarial evidence identity mismatch');
  }
  requireDigest(evidence.fixtureDigest, 'portable phase-host adversarial fixture digest');
  requireDigest(evidence.receiptDigest, 'portable phase-host adversarial receipt digest');
  requireDigest(evidence.sha256, 'portable phase-host adversarial receipt file digest');
  requireCommit(evidence.sourceCommit, 'portable phase-host adversarial source commit');
  if (!Number.isInteger(evidence.fullTests)
      || evidence.fullTests !== profile.portablePhaseHostAdversarialFullTests) {
    throw new Error('portable phase-host adversarial full test evidence mismatch');
  }
  const text = await readBlob(
    repositoryRoot,
    commit,
    evidence.path,
    'portable phase-host adversarial receipt',
  );
  if (sha256Text(text) !== evidence.sha256) {
    throw new Error('portable phase-host adversarial receipt file digest mismatch');
  }
  const receipt = parseJson(text, 'portable phase-host adversarial receipt');
  requireCanonicalJsonText(text, receipt, 'portable phase-host adversarial receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== PORTABLE_PHASE_HOST_ADVERSARIAL_CERTIFICATION_ID
      || receipt.protocolId !== PORTABLE_PHASE_HOST_ADVERSARIAL_CERTIFICATION_PROTOCOL
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.source?.commit !== evidence.sourceCommit
      || receipt.fixture?.logicalDigest !== evidence.fixtureDigest
      || receipt.testRuns?.full?.status !== 'pass'
      || receipt.testRuns.full.tests !== evidence.fullTests) {
    throw new Error('portable phase-host adversarial receipt binding mismatch');
  }
  await requireCommitObject(repositoryRoot, evidence.sourceCommit, 'portable phase-host adversarial source commit');
  await isAncestor(repositoryRoot, evidence.sourceCommit, commit, 'portable phase-host adversarial source commit');
}

async function verifyEvidence(repositoryRoot, commit, godagents, profile = LEGACY_PROFILE) {
  const expectedEvidenceKeys = profile.portableConformance
    ? ['boundaryFiles', 'integrationReceipt', 'portablePhaseHost',
      ...(profile.portableRealmConsequenceSdk ? ['portableRealmConsequenceSdk'] : []),
      ...(profile.admittedPortableIdentityLauncher ? ['admittedPortableIdentityLauncher'] : []),
      ...(profile.missionProgram ? ['missionProgram'] : []),
       ...(profile.missionProgramForensics ? ['missionProgramForensics'] : []),
       ...(profile.agentProfileContract ? ['agentProfileContract'] : []),
       ...(profile.missionOperationAdapter ? ['missionOperationAdapter'] : []),
       ...(profile.deferredReviewMissionOperationAdapter ? ['deferredReviewMissionOperationAdapter'] : []),
       ...(profile.revisionMissionOperationAdapter ? ['revisionMissionOperationAdapter'] : []),
       ...(profile.delegationMissionOperationAdapter ? ['delegationMissionOperationAdapter'] : []),
       ...(profile.realmConsequenceMissionOperationAdapter ? ['realmConsequenceMissionOperationAdapter'] : []),
       ...(profile.missionOperationEvidence ? ['missionOperationEvidence'] : []),
       ...(profile.missionForensicIndex ? ['missionForensicIndex'] : []),
       ...(profile.portablePhaseHostAdversarial ? ['portablePhaseHostAdversarial'] : [])]
    : ['boundaryFiles', 'integrationReceipt'];
  exactKeys(godagents.evidence, expectedEvidenceKeys, 'Godagents evidence');
  if (!Array.isArray(godagents.evidence.boundaryFiles)
      || !equal(godagents.evidence.boundaryFiles.map(({ path }) => path), [...profile.boundaryPaths])) {
    throw new Error('Godagents boundary evidence paths are not canonical');
  }
  for (const row of godagents.evidence.boundaryFiles) {
    exactKeys(row, ['path', 'sha256'], 'Godagents boundary evidence row');
    requireRelativePath(row.path, 'Godagents boundary evidence path');
    requireDigest(row.sha256, 'Godagents boundary evidence digest');
    if (await hashBlob(repositoryRoot, commit, row.path, `Godagents evidence ${row.path}`) !== row.sha256) {
      throw new Error(`Godagents boundary evidence drift: ${row.path}`);
    }
  }
  exactKeys(godagents.evidence.integrationReceipt, ['metrics', 'path', 'receiptDigest', 'sha256'], 'integration evidence receipt');
  const receiptRow = godagents.evidence.integrationReceipt;
  if (receiptRow.path !== INTEGRATION_RECEIPT_PATH) throw new Error('integration evidence path mismatch');
  requireDigest(receiptRow.sha256, 'integration evidence file digest');
  requireDigest(receiptRow.receiptDigest, 'integration evidence receipt digest');
  const text = await readBlob(repositoryRoot, commit, receiptRow.path, 'Godskills integration receipt');
  if (sha256Text(text) !== receiptRow.sha256) throw new Error('Godskills integration receipt file digest mismatch');
  const receipt = parseJson(text, 'Godskills integration receipt');
  requireCanonicalJsonText(text, receipt, 'Godskills integration receipt');
  if (receipt.status !== 'certified'
      || receipt.certificationId !== 'godskills-v3-mission-binding'
      || receipt.receiptDigest !== receiptRow.receiptDigest
      || !equal(receipt.metrics, receiptRow.metrics)) {
    throw new Error('Godskills integration evidence identity mismatch');
  }
  if (profile.portableConformance) {
    await verifyPortableConformanceEvidence(repositoryRoot, commit, godagents.evidence.portablePhaseHost);
  }
  if (profile.portableRealmConsequenceSdk) {
    await verifyPortableRealmConsequenceSdkEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.portableRealmConsequenceSdk,
      profile,
    );
  }
  if (profile.admittedPortableIdentityLauncher) {
    await verifyAdmittedPortableIdentityLauncherEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.admittedPortableIdentityLauncher,
      profile,
    );
  }
  if (profile.missionProgram) {
    await verifyMissionProgramEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.missionProgram,
      profile,
    );
  }
  if (profile.missionProgramForensics) {
    await verifyMissionProgramForensicsEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.missionProgramForensics,
      profile,
    );
  }
  if (profile.agentProfileContract) {
    await verifyAgentProfileContractEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.agentProfileContract,
      profile,
    );
  }
  if (profile.missionOperationAdapter) {
    await verifyMissionOperationAdapterEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.missionOperationAdapter,
      profile,
    );
  }
  if (profile.deferredReviewMissionOperationAdapter) {
    await verifyDeferredReviewMissionOperationAdapterEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.deferredReviewMissionOperationAdapter,
      profile,
    );
  }
  if (profile.revisionMissionOperationAdapter) {
    await verifyRevisionMissionOperationAdapterEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.revisionMissionOperationAdapter,
      profile,
    );
  }
  if (profile.delegationMissionOperationAdapter) {
    await verifyDelegationMissionOperationAdapterEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.delegationMissionOperationAdapter,
      profile,
    );
  }
  if (profile.realmConsequenceMissionOperationAdapter) {
    await verifyRealmConsequenceMissionOperationAdapterEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.realmConsequenceMissionOperationAdapter,
      profile,
    );
  }
  if (profile.missionOperationEvidence) {
    await verifyMissionOperationEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.missionOperationEvidence,
      profile,
    );
  }
  if (profile.missionForensicIndex) {
    await verifyMissionForensicIndexEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.missionForensicIndex,
      profile,
    );
  }
  if (profile.portablePhaseHostAdversarial) {
    await verifyPortablePhaseHostAdversarialEvidence(
      repositoryRoot,
      commit,
      godagents.evidence.portablePhaseHostAdversarial,
      profile,
    );
  }
  return receipt;
}

async function verifyCertificate(receipt, {
  godagentsRoot,
  godskillsRoot,
  expectedGodagentsCommit,
  expectedGodskillsCommit,
  requireExactRefs = false,
  protocolId,
  status,
  profile = LEGACY_PROFILE,
} = {}) {
  validateReceiptShape(receipt, { protocolId, status, profile });
  const agentsSource = receipt.source.godagents;
  const skillsSource = receipt.source.godskills;
  if (expectedGodagentsCommit !== undefined) {
    requireCommit(expectedGodagentsCommit, 'expected Godagents commit');
    if (agentsSource.commit !== expectedGodagentsCommit) throw new Error('Godagents head does not match certificate');
  }
  if (expectedGodskillsCommit !== undefined) {
    requireCommit(expectedGodskillsCommit, 'expected Godskills commit');
    if (skillsSource.commit !== expectedGodskillsCommit) throw new Error('Godskills head does not match certificate');
  }
  await requireCommitObject(godagentsRoot, agentsSource.commit, 'Godagents source commit');
  await requireCommitObject(godskillsRoot, skillsSource.commit, 'Godskills source commit');
  for (const [name, root, source] of [
    ['Godagents', godagentsRoot, agentsSource],
    ['Godskills', godskillsRoot, skillsSource],
  ]) {
    if (requireExactRefs || source.refs.main !== source.commit || source.refs.originMain !== source.commit) {
      const [actualMain, actualOriginMain] = await Promise.all([
        resolveCommit(root, 'main', `${name} main`),
        resolveCommit(root, 'origin/main', `${name} origin main`),
      ]);
      if (actualMain !== source.refs.main || actualOriginMain !== source.refs.originMain) {
        const appendOnlyGodagents = profile.appendOnlyPaths !== undefined
          && name === 'Godagents'
          && requireExactRefs
          && source.refs.main === source.commit
          && source.refs.originMain === source.commit;
        if (!appendOnlyGodagents) {
          if (actualMain !== source.refs.main) {
            throw new Error(`${name} main ref does not match certificate`);
          }
          throw new Error(`${name} origin main ref does not match certificate`);
        }
        await verifyAppendOnlyGodagentsTip(root, receipt, source, profile);
      }
    }
    if (source.refs.main !== source.commit || source.refs.originMain !== source.commit) {
      throw new Error(`${name} refs are not the certified current head`);
    }
  }

  exactKeys(receipt.godagents, ['evidence', 'hostRelease', 'sdk'], 'Godagents certificate');
  await verifySdk(godagentsRoot, agentsSource.commit, receipt.godagents.sdk, profile);
  await verifyHostRelease(godagentsRoot, agentsSource.commit, receipt.godagents.hostRelease);
  const integration = await verifyEvidence(godagentsRoot, agentsSource.commit, receipt.godagents, profile);

  exactKeys(receipt.godskills, ['beacon', 'releaseInputs'], 'Godskills certificate');
  exactKeys(receipt.godskills.releaseInputs, ['adaptiveReview', 'canonicalHost'], 'Godskills release inputs');
  const canonicalHost = receipt.godskills.releaseInputs.canonicalHost;
  exactKeys(canonicalHost, ['artifactRows', 'pin', 'pinDigest', 'profile'], 'canonical Godskills release input');
  if (canonicalHost.profile !== 'canonical-host') throw new Error('canonical Godskills release profile mismatch');
  requireDigest(canonicalHost.pinDigest, 'canonical Godskills pin digest');
  if (canonicalHost.pinDigest !== sha256Value(canonicalHost.pin)) throw new Error('canonical Godskills pin digest mismatch');
  await verifyPinArtifacts(godskillsRoot, skillsSource.commit, canonicalHost, 'canonical Godskills release');

  const adaptiveReview = receipt.godskills.releaseInputs.adaptiveReview;
  exactKeys(adaptiveReview, ['artifactRows', 'pin', 'pinDigest', 'profile', 'source'], 'adaptive Godskills release input');
  if (adaptiveReview.profile !== 'adaptive-review') throw new Error('adaptive Godskills release profile mismatch');
  requireDigest(adaptiveReview.pinDigest, 'adaptive Godskills pin digest');
  if (adaptiveReview.pinDigest !== sha256Value(adaptiveReview.pin)) throw new Error('adaptive Godskills pin digest mismatch');
  if (adaptiveReview.pin.activation === undefined) throw new Error('adaptive Godskills release lacks activation root');
  await verifyPinArtifacts(godskillsRoot, skillsSource.commit, adaptiveReview, 'adaptive Godskills release');
  await verifyAdaptiveSource(
    godagentsRoot,
    agentsSource.commit,
    adaptiveReview.source,
    godskillsRoot,
    skillsSource.commit,
  );
  await verifyBeacon(godskillsRoot, skillsSource.commit, receipt.godskills.beacon);
  validateBoundaryEvidence(receipt.boundaries, receipt.godagents.evidence, integration);

  return Object.freeze({ status: 'verified', receiptDigest: receipt.receiptDigest });
}

export async function verifyCrossRepositoryCurrentHeadCertificate(receipt, options = {}) {
  return verifyCertificate(receipt, {
    ...options,
    protocolId: CROSS_REPOSITORY_CURRENT_HEAD_PROTOCOL,
    status: 'certified',
  });
}

export async function verifyCrossRepositoryIssuanceSnapshot(receipt, options = {}) {
  return verifyCertificate(receipt, {
    ...options,
    protocolId: CROSS_REPOSITORY_ISSUANCE_SNAPSHOT_PROTOCOL,
    status: 'certified-issuance-snapshot',
  });
}

async function collectSource(repositoryRoot, commit, refs, repository) {
  const actualRefs = {
    main: await resolveCommit(repositoryRoot, 'main', `${repository} main`),
    originMain: await resolveCommit(repositoryRoot, 'origin/main', `${repository} origin main`),
  };
  if (!equal(actualRefs, refs)) throw new Error(`${repository} reconciled refs changed during certificate build`);
  if (actualRefs.main !== commit || actualRefs.originMain !== commit) {
    throw new Error(`${repository} commit is not the reconciled main head`);
  }
  return { repository, commit, refs: actualRefs };
}

async function collectIntegrationEvidence(repositoryRoot, commit, profile = LEGACY_PROFILE) {
  const boundaryFiles = [];
  for (const path of profile.boundaryPaths) {
    boundaryFiles.push({ path, sha256: await hashBlob(repositoryRoot, commit, path, `Godagents evidence ${path}`) });
  }
  const text = await readBlob(repositoryRoot, commit, INTEGRATION_RECEIPT_PATH, 'Godskills integration receipt');
  const receipt = parseJson(text, 'Godskills integration receipt');
  const evidence = {
    boundaryFiles,
    integrationReceipt: {
      path: INTEGRATION_RECEIPT_PATH,
      sha256: sha256Text(text),
      receiptDigest: receipt.receiptDigest,
      metrics: clone(receipt.metrics),
    },
  };
  if (profile.portableConformance) {
    const portableText = await readBlob(
      repositoryRoot,
      commit,
      PORTABLE_CONFORMANCE_RECEIPT_PATH,
      'portable conformance receipt',
    );
    const portable = parseJson(portableText, 'portable conformance receipt');
    evidence.portablePhaseHost = {
      certificationId: portable.certificationId,
      fixtureDigest: portable.fixture.logicalDigest,
      path: PORTABLE_CONFORMANCE_RECEIPT_PATH,
      receiptDigest: portable.receiptDigest,
      sha256: sha256Text(portableText),
      sourceCommit: portable.source.commit,
    };
  }
  if (profile.portableRealmConsequenceSdk) {
    const portableRealmText = await readBlob(
      repositoryRoot,
      commit,
      PORTABLE_REALM_CONSEQUENCE_SDK_RECEIPT_PATH,
      'portable Realm consequence SDK receipt',
    );
    const portableRealm = parseJson(portableRealmText, 'portable Realm consequence SDK receipt');
    evidence.portableRealmConsequenceSdk = {
      certificationId: portableRealm.certificationId,
      fixtureDigest: portableRealm.fixture.logicalDigest,
      fullTests: portableRealm.testRuns.full.tests,
      path: PORTABLE_REALM_CONSEQUENCE_SDK_RECEIPT_PATH,
      receiptDigest: portableRealm.receiptDigest,
      sha256: sha256Text(portableRealmText),
      sourceCommit: portableRealm.source.commit,
    };
  }
  if (profile.admittedPortableIdentityLauncher) {
    const launcherText = await readBlob(
      repositoryRoot,
      commit,
      ADMITTED_PORTABLE_IDENTITY_LAUNCHER_RECEIPT_PATH,
      'admitted portable identity launcher receipt',
    );
    const launcher = parseJson(launcherText, 'admitted portable identity launcher receipt');
    evidence.admittedPortableIdentityLauncher = {
      certificationId: launcher.certificationId,
      fixtureDigest: launcher.fixture.logicalDigest,
      fullTests: launcher.testRuns.full.tests,
      path: ADMITTED_PORTABLE_IDENTITY_LAUNCHER_RECEIPT_PATH,
      receiptDigest: launcher.receiptDigest,
      sha256: sha256Text(launcherText),
      sourceCommit: launcher.source.commit,
    };
  }
  if (profile.missionProgram) {
    const missionProgramText = await readBlob(
      repositoryRoot,
      commit,
      MISSION_PROGRAM_RECEIPT_PATH,
      'mission program receipt',
    );
    const missionProgram = parseJson(missionProgramText, 'mission program receipt');
    evidence.missionProgram = {
      certificationId: missionProgram.certificationId,
      fixtureDigest: missionProgram.fixture.logicalDigest,
      fullTests: missionProgram.testRuns.full.tests,
      path: MISSION_PROGRAM_RECEIPT_PATH,
      receiptDigest: missionProgram.receiptDigest,
      sha256: sha256Text(missionProgramText),
      sourceCommit: missionProgram.source.commit,
    };
  }
  if (profile.missionProgramForensics) {
    const missionProgramForensicsText = await readBlob(
      repositoryRoot,
      commit,
      MISSION_PROGRAM_FORENSICS_RECEIPT_PATH,
      'mission program forensics receipt',
    );
    const missionProgramForensics = parseJson(missionProgramForensicsText, 'mission program forensics receipt');
    evidence.missionProgramForensics = {
      certificationId: missionProgramForensics.certificationId,
      fixtureDigest: missionProgramForensics.fixture.logicalDigest,
      fullTests: missionProgramForensics.testRuns.full.tests,
      path: MISSION_PROGRAM_FORENSICS_RECEIPT_PATH,
      receiptDigest: missionProgramForensics.receiptDigest,
      sha256: sha256Text(missionProgramForensicsText),
      sourceCommit: missionProgramForensics.source.commit,
    };
  }
  if (profile.agentProfileContract) {
    const agentProfileText = await readBlob(
      repositoryRoot,
      commit,
      AGENT_PROFILE_CONTRACT_RECEIPT_PATH,
      'agent profile contract receipt',
    );
    const agentProfile = parseJson(agentProfileText, 'agent profile contract receipt');
    evidence.agentProfileContract = {
      certificationId: agentProfile.certificationId,
      fixtureDigest: agentProfile.fixture.logicalDigest,
      fullTests: agentProfile.testRuns.full.tests,
      path: AGENT_PROFILE_CONTRACT_RECEIPT_PATH,
      receiptDigest: agentProfile.receiptDigest,
      sha256: sha256Text(agentProfileText),
      sourceCommit: agentProfile.source.commit,
    };
  }
  if (profile.missionOperationAdapter) {
    const missionOperationText = await readBlob(
      repositoryRoot,
      commit,
      MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      'mission operation adapter receipt',
    );
    const missionOperation = parseJson(missionOperationText, 'mission operation adapter receipt');
    evidence.missionOperationAdapter = {
      certificationId: missionOperation.certificationId,
      fixtureDigest: missionOperation.fixture.logicalDigest,
      fullTests: missionOperation.testRuns.full.tests,
      path: MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      receiptDigest: missionOperation.receiptDigest,
      sha256: sha256Text(missionOperationText),
      sourceCommit: missionOperation.source.commit,
    };
  }
  if (profile.deferredReviewMissionOperationAdapter) {
    const deferredReviewMissionOperationText = await readBlob(
      repositoryRoot,
      commit,
      DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      'deferred review mission operation adapter receipt',
    );
    const deferredReviewMissionOperation = parseJson(
      deferredReviewMissionOperationText,
      'deferred review mission operation adapter receipt',
    );
    evidence.deferredReviewMissionOperationAdapter = {
      certificationId: deferredReviewMissionOperation.certificationId,
      fixtureDigest: deferredReviewMissionOperation.fixture.logicalDigest,
      fullTests: deferredReviewMissionOperation.testRuns.full.tests,
      path: DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      receiptDigest: deferredReviewMissionOperation.receiptDigest,
      sha256: sha256Text(deferredReviewMissionOperationText),
      sourceCommit: deferredReviewMissionOperation.source.commit,
    };
  }
  if (profile.revisionMissionOperationAdapter) {
    const revisionMissionOperationText = await readBlob(
      repositoryRoot,
      commit,
      REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      'revision mission operation adapter receipt',
    );
    const revisionMissionOperation = parseJson(
      revisionMissionOperationText,
      'revision mission operation adapter receipt',
    );
    evidence.revisionMissionOperationAdapter = {
      certificationId: revisionMissionOperation.certificationId,
      fixtureDigest: revisionMissionOperation.fixture.logicalDigest,
      fullTests: revisionMissionOperation.testRuns.full.tests,
      path: REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      receiptDigest: revisionMissionOperation.receiptDigest,
      sha256: sha256Text(revisionMissionOperationText),
      sourceCommit: revisionMissionOperation.source.commit,
    };
  }
  if (profile.delegationMissionOperationAdapter) {
    const delegationMissionOperationText = await readBlob(
      repositoryRoot,
      commit,
      DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      'delegation mission operation adapter receipt',
    );
    const delegationMissionOperation = parseJson(
      delegationMissionOperationText,
      'delegation mission operation adapter receipt',
    );
    evidence.delegationMissionOperationAdapter = {
      certificationId: delegationMissionOperation.certificationId,
      fixtureDigest: delegationMissionOperation.fixture.logicalDigest,
      fullTests: delegationMissionOperation.testRuns.full.tests,
      path: DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      receiptDigest: delegationMissionOperation.receiptDigest,
      sha256: sha256Text(delegationMissionOperationText),
      sourceCommit: delegationMissionOperation.source.commit,
    };
  }
  if (profile.realmConsequenceMissionOperationAdapter) {
    const realmConsequenceMissionOperationText = await readBlob(
      repositoryRoot,
      commit,
      REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      'Realm consequence mission operation adapter receipt',
    );
    const realmConsequenceMissionOperation = parseJson(
      realmConsequenceMissionOperationText,
      'Realm consequence mission operation adapter receipt',
    );
    evidence.realmConsequenceMissionOperationAdapter = {
      certificationId: realmConsequenceMissionOperation.certificationId,
      fixtureDigest: realmConsequenceMissionOperation.fixture.logicalDigest,
      fullTests: realmConsequenceMissionOperation.testRuns.full.tests,
      path: REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
      receiptDigest: realmConsequenceMissionOperation.receiptDigest,
      sha256: sha256Text(realmConsequenceMissionOperationText),
      sourceCommit: realmConsequenceMissionOperation.source.commit,
    };
  }
  if (profile.missionOperationEvidence) {
    const missionOperationEvidenceText = await readBlob(
      repositoryRoot,
      commit,
      MISSION_OPERATION_EVIDENCE_RECEIPT_PATH,
      'mission operation evidence projection receipt',
    );
    const missionOperationEvidence = parseJson(
      missionOperationEvidenceText,
      'mission operation evidence projection receipt',
    );
    evidence.missionOperationEvidence = {
      certificationId: missionOperationEvidence.certificationId,
      fixtureDigest: missionOperationEvidence.fixture.logicalDigest,
      fullTests: missionOperationEvidence.testRuns.full.tests,
      path: MISSION_OPERATION_EVIDENCE_RECEIPT_PATH,
      receiptDigest: missionOperationEvidence.receiptDigest,
      sha256: sha256Text(missionOperationEvidenceText),
      sourceCommit: missionOperationEvidence.source.commit,
    };
  }
  if (profile.missionForensicIndex) {
    const missionForensicIndexText = await readBlob(
      repositoryRoot,
      commit,
      MISSION_FORENSIC_INDEX_RECEIPT_PATH,
      'mission forensic index receipt',
    );
    const missionForensicIndex = parseJson(missionForensicIndexText, 'mission forensic index receipt');
    evidence.missionForensicIndex = {
      certificationId: missionForensicIndex.certificationId,
      fixtureDigest: missionForensicIndex.fixture.logicalDigest,
      fullTests: missionForensicIndex.testRuns.full.tests,
      path: MISSION_FORENSIC_INDEX_RECEIPT_PATH,
      receiptDigest: missionForensicIndex.receiptDigest,
      sha256: sha256Text(missionForensicIndexText),
      sourceCommit: missionForensicIndex.source.commit,
    };
  }
  if (profile.portablePhaseHostAdversarial) {
    const portablePhaseHostAdversarialText = await readBlob(
      repositoryRoot,
      commit,
      PORTABLE_PHASE_HOST_ADVERSARIAL_RECEIPT_PATH,
      'portable phase-host adversarial receipt',
    );
    const portablePhaseHostAdversarial = parseJson(
      portablePhaseHostAdversarialText,
      'portable phase-host adversarial receipt',
    );
    evidence.portablePhaseHostAdversarial = {
      certificationId: portablePhaseHostAdversarial.certificationId,
      fixtureDigest: portablePhaseHostAdversarial.fixture.logicalDigest,
      fullTests: portablePhaseHostAdversarial.testRuns.full.tests,
      path: PORTABLE_PHASE_HOST_ADVERSARIAL_RECEIPT_PATH,
      receiptDigest: portablePhaseHostAdversarial.receiptDigest,
      sha256: sha256Text(portablePhaseHostAdversarialText),
      sourceCommit: portablePhaseHostAdversarial.source.commit,
    };
  }
  return evidence;
}

async function collectBeacon(godskillsRoot, godskillsCommit) {
  const text = await readBlob(godskillsRoot, godskillsCommit, BEACON_SNAPSHOT_PATH, 'Beacon snapshot');
  const snapshot = parseJson(text, 'Beacon snapshot');
  return { snapshot: { path: BEACON_SNAPSHOT_PATH, sha256: sha256Text(text), ...snapshot } };
}

async function collectSdk(godagentsRoot, godagentsCommit, profile = LEGACY_PROFILE) {
  const packageText = await readBlob(godagentsRoot, godagentsCommit, SDK_PACKAGE_PATH, 'SDK package');
  const packageValue = parseJson(packageText, 'SDK package');
  const entrypointText = await readBlob(godagentsRoot, godagentsCommit, SDK_ENTRYPOINT_PATH, 'SDK entrypoint');
  const sdk = {
    entrypoint: { path: SDK_ENTRYPOINT_PATH, sha256: sha256Text(entrypointText) },
    packageExports: clone(packageValue.exports),
    packageExportsDigest: sha256Value(packageValue.exports),
    packageSha256: sha256Text(packageText),
    rootExports: parseSdkExports(entrypointText),
  };
  if (profile.portableConformance) {
    sdk.supportedAdapterProtocols = [...(profile.supportedAdapterProtocols ?? [PORTABLE_CONFORMANCE_PROTOCOL])];
  }
  return sdk;
}

async function collectHostRelease(godagentsRoot, godagentsCommit) {
  const text = await readBlob(godagentsRoot, godagentsCommit, HOST_POLICY_PATH, 'host policy');
  const policy = parseJson(text, 'host policy');
  const pin = policy?.runtime?.godskillsRelease;
  if (!pin) throw new Error('host policy lacks Godskills release pin');
  return {
    path: HOST_POLICY_PATH,
    sha256: sha256Text(text),
    pinDigest: sha256Value(pin),
    repositoryRoot: pin.repositoryRoot,
    pin: clone(pin),
  };
}

async function buildCertificate({
  godagentsRoot,
  godskillsRoot,
  godagentsCommit,
  godskillsCommit,
  refs,
  adaptiveReviewPin,
  adaptiveReviewSource,
  testRuns,
  protocolId,
  status,
  profile = LEGACY_PROFILE,
} = {}) {
  requireCommit(godagentsCommit, 'Godagents build commit');
  requireCommit(godskillsCommit, 'Godskills build commit');
  if (!refs?.godagents || !refs?.godskills) throw new Error('reconciled refs are required');
  if (!adaptiveReviewPin || !adaptiveReviewSource) throw new Error('adaptive review input is required');
  validateTestRuns(testRuns);
  await requireCommitObject(godagentsRoot, godagentsCommit, 'Godagents build commit');
  await requireCommitObject(godskillsRoot, godskillsCommit, 'Godskills build commit');
  const [agents, skills, sdk, hostRelease, evidence, beacon, adaptiveSourceText] = await Promise.all([
    collectSource(godagentsRoot, godagentsCommit, refs.godagents, 'eternities-godagents'),
    collectSource(godskillsRoot, godskillsCommit, refs.godskills, 'eternities-godskills'),
    collectSdk(godagentsRoot, godagentsCommit, profile),
    collectHostRelease(godagentsRoot, godagentsCommit),
    collectIntegrationEvidence(godagentsRoot, godagentsCommit, profile),
    collectBeacon(godskillsRoot, godskillsCommit),
    readBlob(godagentsRoot, godagentsCommit, adaptiveReviewSource.path, 'adaptive release source'),
  ]);
  const match = adaptiveSourceText.match(/pinnedGodskillsReviewSourceCommit\s*=\s*['"]([a-f0-9]{40})['"]/);
  if (!match || match[1] !== adaptiveReviewSource.sourceCommit) {
    throw new Error('adaptive review source does not declare the supplied Godskills commit');
  }
  const integration = JSON.parse(await readBlob(godagentsRoot, godagentsCommit, INTEGRATION_RECEIPT_PATH, 'Godskills integration receipt'));
  const boundaries = {
    noImplicitActivation: {
      canonicalHostActivation: hostRelease.pin.activation === undefined ? 'absent' : 'present',
      completeActivationTuple: ['verified-root', 'classifier', 'transport'],
      evidencePaths: [
        'src/skills/mission-binder.mjs',
        'tests/godskills-adaptive-activation.test.mjs',
      ],
      incompleteTupleFailsClosed: true,
      legacyOperationPreserved: true,
    },
    noAuthorityExpansion: {
      authorityExpansions: integration.metrics.authorityExpansions,
      evidencePaths: [
        'src/skills/godskills-adapter.mjs',
        'src/skills/mission-binder.mjs',
        'tests/godskills-mission-binder.test.mjs',
        'tests/godskills-v3-integration.test.mjs',
        INTEGRATION_RECEIPT_PATH,
      ],
      hostCeilingsRemainAuthoritative: true,
      unselectedBodyLoads: integration.metrics.unselectedBodyLoads,
    },
  };
  const unsigned = {
    schemaVersion: 1,
    status,
    protocolId,
    source: { godagents: agents, godskills: skills },
    godagents: {
      sdk,
      hostRelease,
      evidence,
    },
    godskills: {
      beacon,
      releaseInputs: {
        canonicalHost: {
          profile: 'canonical-host',
          pin: clone(hostRelease.pin),
          pinDigest: hostRelease.pinDigest,
          artifactRows: referenceRows(hostRelease.pin),
        },
        adaptiveReview: {
          profile: 'adaptive-review',
          source: {
            path: adaptiveReviewSource.path,
            sha256: sha256Text(adaptiveSourceText),
            sourceCommit: adaptiveReviewSource.sourceCommit,
          },
          pin: clone(adaptiveReviewPin),
          pinDigest: sha256Value(adaptiveReviewPin),
          artifactRows: referenceRows(adaptiveReviewPin),
        },
      },
    },
    boundaries,
    proofLimits: [...PROOF_LIMITS],
    testRuns: clone(testRuns),
  };
  const receipt = deepFreeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
  await verifyCertificate(receipt, {
    godagentsRoot,
    godskillsRoot,
    expectedGodagentsCommit: godagentsCommit,
    expectedGodskillsCommit: godskillsCommit,
    requireExactRefs: true,
    protocolId,
    status,
    profile,
  });
  return receipt;
}

export async function buildCrossRepositoryCurrentHeadCertificate(options = {}) {
  return buildCertificate({
    ...options,
    protocolId: CROSS_REPOSITORY_CURRENT_HEAD_PROTOCOL,
    status: 'certified',
  });
}

export async function verifyCrossRepositoryCurrentHeadCertificateV2(receipt, options = {}) {
  const currentProfile = await currentHeadV2Profile(
    options.godagentsRoot,
    receipt?.source?.godagents?.commit,
  );
  const evidencePresent = receipt?.godagents?.evidence?.missionProgramForensics !== undefined;
  if (currentProfile.forensicsPresent !== evidencePresent) {
    throw new Error('current-head v2 forensic profile does not match the committed source');
  }
  const agentProfileEvidencePresent = receipt?.godagents?.evidence?.agentProfileContract !== undefined;
  if (currentProfile.agentProfilePresent !== agentProfileEvidencePresent) {
    throw new Error('current-head v2 agent profile profile does not match the committed source');
  }
  const missionOperationAdapterEvidencePresent = receipt?.godagents?.evidence?.missionOperationAdapter !== undefined;
  if (currentProfile.missionOperationAdapterPresent !== missionOperationAdapterEvidencePresent) {
    throw new Error('current-head v2 mission operation adapter profile does not match the committed source');
  }
  const deferredReviewMissionOperationEvidencePresent = receipt?.godagents?.evidence?.deferredReviewMissionOperationAdapter !== undefined;
  if (currentProfile.deferredReviewMissionOperationAdapterPresent !== deferredReviewMissionOperationEvidencePresent) {
    throw new Error('current-head v2 deferred review mission operation adapter profile does not match the committed source');
  }
  const revisionMissionOperationEvidencePresent = receipt?.godagents?.evidence?.revisionMissionOperationAdapter !== undefined;
  if (currentProfile.revisionMissionOperationAdapterPresent !== revisionMissionOperationEvidencePresent) {
    throw new Error('current-head v2 revision mission operation adapter profile does not match the committed source');
  }
  const delegationMissionOperationEvidencePresent = receipt?.godagents?.evidence?.delegationMissionOperationAdapter !== undefined;
  if (currentProfile.delegationMissionOperationAdapterPresent !== delegationMissionOperationEvidencePresent) {
    throw new Error('current-head v2 delegation mission operation adapter profile does not match the committed source');
  }
  const realmConsequenceMissionOperationEvidencePresent = receipt?.godagents?.evidence?.realmConsequenceMissionOperationAdapter !== undefined;
  if (currentProfile.realmConsequenceMissionOperationAdapterPresent !== realmConsequenceMissionOperationEvidencePresent) {
    throw new Error('current-head v2 Realm consequence mission operation adapter profile does not match the committed source');
  }
  const missionOperationEvidencePresent = receipt?.godagents?.evidence?.missionOperationEvidence !== undefined;
  if (currentProfile.missionOperationEvidencePresent !== missionOperationEvidencePresent) {
    throw new Error('current-head v2 mission operation evidence projection profile does not match the committed source');
  }
  const missionForensicIndexEvidencePresent = receipt?.godagents?.evidence?.missionForensicIndex !== undefined;
  if (currentProfile.missionForensicIndexPresent !== missionForensicIndexEvidencePresent) {
    throw new Error('current-head v2 mission forensic index profile does not match the committed source');
  }
  const portablePhaseHostAdversarialEvidencePresent = receipt?.godagents?.evidence?.portablePhaseHostAdversarial !== undefined;
  if (currentProfile.portablePhaseHostAdversarialPresent !== portablePhaseHostAdversarialEvidencePresent) {
    throw new Error('current-head v2 portable phase-host adversarial profile does not match the committed source');
  }
  return verifyCertificate(receipt, {
    ...options,
    protocolId: CROSS_REPOSITORY_CURRENT_HEAD_V2_PROTOCOL,
    status: 'certified',
    profile: currentProfile.profile,
  });
}

async function hasCommittedPath(repositoryRoot, commit, path) {
  try {
    await readBlob(repositoryRoot, commit, path, 'current-head profile probe');
    return true;
  } catch {
    return false;
  }
}

export async function buildCrossRepositoryCurrentHeadCertificateV2(options = {}) {
  const currentProfile = await currentHeadV2Profile(
    options.godagentsRoot,
    options.godagentsCommit,
  );
  return buildCertificate({
    ...options,
    protocolId: CROSS_REPOSITORY_CURRENT_HEAD_V2_PROTOCOL,
    status: 'certified',
    profile: currentProfile.profile,
  });
}

async function currentHeadV2Profile(repositoryRoot, commit) {
  await requireCommitObject(repositoryRoot, commit, 'Godagents build commit');
  const [forensicsPresent, agentProfilePresent, deferredReviewMissionOperationAdapterPresent, revisionMissionOperationAdapterPresent, delegationMissionOperationAdapterPresent, realmConsequenceMissionOperationAdapterPresent, missionOperationEvidencePresent, missionForensicIndexPresent, portablePhaseHostAdversarialPresent] = await Promise.all([
    hasCommittedPath(repositoryRoot, commit, MISSION_PROGRAM_FORENSICS_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, AGENT_PROFILE_CONTRACT_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, DEFERRED_REVIEW_MISSION_OPERATION_ADAPTER_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, REVISION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, DELEGATION_MISSION_OPERATION_ADAPTER_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, MISSION_OPERATION_EVIDENCE_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, MISSION_FORENSIC_INDEX_RECEIPT_PATH),
    hasCommittedPath(repositoryRoot, commit, PORTABLE_PHASE_HOST_ADVERSARIAL_RECEIPT_PATH),
  ]);
  const missionOperationAdapterPresent = await hasCommittedPath(
    repositoryRoot,
    commit,
    MISSION_OPERATION_ADAPTER_RECEIPT_PATH,
  );
  const profile = forensicsPresent
    ? (agentProfilePresent
      ? (missionOperationAdapterPresent
        ? (deferredReviewMissionOperationAdapterPresent
          ? (revisionMissionOperationAdapterPresent
            ? (delegationMissionOperationAdapterPresent
              ? (realmConsequenceMissionOperationAdapterPresent
                ? (missionOperationEvidencePresent
                  ? (missionForensicIndexPresent
                    ? (portablePhaseHostAdversarialPresent
                      ? CURRENT_HEAD_V2_PROFILE
                      : PRE_PORTABLE_PHASE_HOST_ADVERSARIAL_CURRENT_HEAD_V2_PROFILE)
                    : PRE_MISSION_FORENSIC_INDEX_CURRENT_HEAD_V2_PROFILE)
                  : PRE_MISSION_OPERATION_EVIDENCE_CURRENT_HEAD_V2_PROFILE)
                : PRE_REALM_CONSEQUENCE_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE)
              : PRE_DELEGATION_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE)
            : PRE_REVISION_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE)
          : PRE_REVIEW_MISSION_OPERATION_ADAPTER_CURRENT_HEAD_V2_PROFILE)
        : PRE_ADAPTER_CURRENT_HEAD_V2_PROFILE)
      : PRE_AGENT_PROFILE_CURRENT_HEAD_V2_PROFILE)
    : (agentProfilePresent
      ? (missionOperationAdapterPresent ? PRE_ADAPTER_CURRENT_HEAD_V2_PROFILE : PRE_FORENSICS_WITH_AGENT_PROFILE_CURRENT_HEAD_V2_PROFILE)
      : PRE_FORENSICS_CURRENT_HEAD_V2_PROFILE);
  return {
    forensicsPresent,
    agentProfilePresent,
    missionOperationAdapterPresent,
    deferredReviewMissionOperationAdapterPresent,
    revisionMissionOperationAdapterPresent,
    delegationMissionOperationAdapterPresent,
    realmConsequenceMissionOperationAdapterPresent,
    missionOperationEvidencePresent,
    missionForensicIndexPresent,
    portablePhaseHostAdversarialPresent,
    profile,
  };
}

export async function buildCrossRepositoryIssuanceSnapshot(options = {}) {
  return buildCertificate({
    ...options,
    protocolId: CROSS_REPOSITORY_ISSUANCE_SNAPSHOT_PROTOCOL,
    status: 'certified-issuance-snapshot',
  });
}
