import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createLocalGodskillsTransport } from '../src/skills/godskills-adapter.mjs';
import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';
import { verifyGodskillsRelease } from '../src/skills/release-verifier.mjs';

const execFileAsync = promisify(execFile);
const digestPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const protocolId = 'eternities-godskills-specialist-preference-v1';
const receiptPath = 'receipts/godskills-specialist-preference-v1.json';
const fixturePath = 'fixtures/godskills-specialist-preference-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-specialist-preference-adapter-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-specialist-preference-adapter-v1.md';
const requirementIds = Object.freeze(Array.from({ length: 12 }, (_, index) =>
  `GSP-${String(index + 1).padStart(3, '0')}`));
const historicalReceiptPaths = Object.freeze([
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/godskills-cycle-receipt.schema.json',
  'schemas/godskills-release-pin.schema.json',
  'schemas/host-policy.schema.json',
  'scripts/build-godskills-specialist-preference-integration-receipt.mjs',
  'scripts/build-godskills-adaptive-integration-receipt.mjs',
  'src/host/admitted-launch.mjs',
  'src/host/local-cli.mjs',
  'src/skills/godskills-adapter.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/release-verifier.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/admitted-launch.test.mjs',
  'tests/godskills-adapter.test.mjs',
  'tests/godskills-adaptive-integration.test.mjs',
  'tests/godskills-mission-binder.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/godskills-runtime-order.test.mjs',
  'tests/godskills-specialist-preference-integration.test.mjs',
  'tests/host-policy.test.mjs',
  'tests/local-cli.test.mjs',
  'tests/networked-secret-containment.test.mjs',
].sort());
const focusedGodagentsTests = testFiles;
const focusedGodskillsTests = Object.freeze([
  'tests/specialist-preference-routing-receipt.test.mjs',
  'tests/specialist-preference-routing.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([
  'docs/specialist-preference-adapter-v1-certification.md',
  receiptPath,
  'src/certification/verify-ledger.mjs',
  'tests/certification-ledger.test.mjs',
]);

export const preferenceBoundaryEvidence = Object.freeze({
  exactPreferenceRoot: Object.freeze([
    'verifies an optional exact specialist preference root while preserving legacy compatibility',
    'rejects recomputed preference receipts that alter authority, closure, parents, or outputs',
  ]),
  specialistDerivedFromEligibility: Object.freeze([
    'specialist preference is derived from verified eligibility and durably bound to the cycle',
  ]),
  allRounderPreferenceFields: Object.freeze([
    'all-rounder and legacy release paths never activate specialist preference',
  ]),
  legacyPreferenceFields: Object.freeze([
    'all-rounder and legacy release paths never activate specialist preference',
    'adapter preserves ordinary mission text and returns selected entrypoints only',
  ]),
  authorityExpansions: Object.freeze([
    'compiler result cannot add authority or effects beyond verified host context',
    'semantic effects can only narrow through explicit concrete host bindings',
  ]),
  recoveryRouteCalls: Object.freeze([
    'specialist recovery replays no route and rejects changed preference identity',
    'recovery after durable binding rehydrates the exact package without rerouting',
  ]),
  contradictoryResultsRejected: Object.freeze([
    'preference routing rejects missing, added, reordered, and contradictory echoes',
  ]),
  localExecutablePinned: Object.freeze([
    'local preference transport executes the separately pinned CLI',
    'host policy accepts one complete preference root and rejects partial or unknown roots',
  ]),
});

const requiredEvidenceTests = Object.freeze(
  [...new Set(Object.values(preferenceBoundaryEvidence).flat())].sort(),
);
const requirementEvidence = Object.freeze({
  'GSP-001': ['tests/godskills-release-verifier.test.mjs'],
  'GSP-002': ['tests/godskills-release-verifier.test.mjs'],
  'GSP-003': ['tests/godskills-adapter.test.mjs'],
  'GSP-004': ['tests/godskills-mission-binder.test.mjs'],
  'GSP-005': ['tests/godskills-mission-binder.test.mjs'],
  'GSP-006': ['tests/godskills-adapter.test.mjs', 'tests/godskills-mission-binder.test.mjs'],
  'GSP-007': ['tests/host-policy.test.mjs', 'tests/networked-secret-containment.test.mjs'],
  'GSP-008': ['tests/godskills-mission-binder.test.mjs', 'tests/godskills-runtime-order.test.mjs'],
  'GSP-009': ['tests/godskills-mission-binder.test.mjs'],
  'GSP-010': ['tests/godskills-adapter.test.mjs', 'tests/godskills-release-verifier.test.mjs'],
  'GSP-011': [fixturePath, 'tests/godskills-specialist-preference-integration.test.mjs'],
  'GSP-012': [specificationPath, 'docs/specialist-preference-adapter-v1-certification.md'],
});
const proofLimits = Object.freeze([
  'no-specialist-quality-superiority-claim',
  'no-unseen-natural-language-routing-correctness-claim',
  'no-arbitrary-injected-transport-provenance-claim',
  'no-hostile-same-user-filesystem-isolation-claim',
  'no-production-telemetry-claim',
  'no-global-activation-or-lunari-integration',
  'no-model-or-provider-quality-claim',
  'no-independent-review-claim',
  'no-eligibility-or-authority-change',
]);

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  if (canonicalJson(actual) !== canonicalJson([...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function requireDigest(value, label) {
  if (!digestPattern.test(value ?? '')) throw new Error(`${label} digest is invalid`);
}

function requireCommit(value, label) {
  if (!commitPattern.test(value ?? '')) throw new Error(`${label} commit is invalid`);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireBoundDocument(value, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (typeof value.path !== 'string' || value.path.length === 0) throw new Error(`${label} path is invalid`);
  requireDigest(value.sha256, label);
}

function requireManifest(value, label, count = null) {
  exactKeys(value, ['paths', 'digest'], label);
  if (!Array.isArray(value.paths) || value.paths.length === 0
      || (count !== null && value.paths.length !== count)
      || new Set(value.paths).size !== value.paths.length
      || !same(value.paths, [...value.paths].sort())) {
    throw new Error(`${label} paths or closure are invalid`);
  }
  requireDigest(value.digest, label);
  if (value.digest !== sha256Value(value.paths) && label === 'Godskills dependency closure') {
    throw new Error('Godskills dependency closure digest mismatch');
  }
}

function requireHistoricalReceipts(value) {
  exactKeys(value, historicalReceiptPaths, 'historical receipt map');
  for (const [path, digest] of Object.entries(value)) {
    if (!historicalReceiptPaths.includes(path)) throw new Error('historical receipt path is invalid');
    requireDigest(digest, `historical receipt ${path}`);
  }
}

function requireTestRuns(testRuns) {
  exactKeys(testRuns, ['godskillsFocused', 'godskillsFull', 'godagentsFocused', 'godagentsFull'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests', 'evidenceDigest', 'evidenceTests'], `${name} test run`);
    if (!['pass', 'fail'].includes(run.status) || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
    if (!Array.isArray(run.evidenceTests)
        || new Set(run.evidenceTests).size !== run.evidenceTests.length
        || !same(run.evidenceTests, [...run.evidenceTests].sort())
        || run.evidenceDigest !== sha256Value(run.evidenceTests)) {
      throw new Error(`${name} test evidence is invalid`);
    }
  }
  if (!same(testRuns.godagentsFocused.evidenceTests, requiredEvidenceTests)) {
    throw new Error('Godagents preference boundary evidence is incomplete');
  }
}

function verifyGodskillsEvidence(godskills) {
  exactKeys(godskills, [
    'commit', 'protocolId', 'authorityExpanded', 'releaseReceipt', 'entrypoint',
    'dependencyClosure', 'outputFixture', 'computedGates', 'proofLimits',
  ], 'Godskills preference evidence');
  requireCommit(godskills.commit, 'Godskills');
  if (godskills.protocolId !== protocolId) throw new Error('Godskills preference protocol is unsupported');
  exactKeys(godskills.releaseReceipt, ['path', 'fileSha256', 'receiptDigest'], 'Godskills preference receipt');
  exactKeys(godskills.entrypoint, ['path', 'sha256'], 'Godskills preference entrypoint');
  exactKeys(godskills.outputFixture, ['path', 'fileSha256', 'logicalDigest'], 'Godskills preference output fixture');
  for (const [value, label] of [
    [godskills.releaseReceipt.fileSha256, 'Godskills preference receipt file'],
    [godskills.releaseReceipt.receiptDigest, 'Godskills preference receipt'],
    [godskills.entrypoint.sha256, 'Godskills preference entrypoint'],
    [godskills.outputFixture.fileSha256, 'Godskills preference fixture file'],
    [godskills.outputFixture.logicalDigest, 'Godskills preference fixture logical'],
  ]) requireDigest(value, label);
  if (godskills.entrypoint.path !== 'scripts/intent-preference.mjs'
      || godskills.releaseReceipt.path !== 'receipts/specialist-preference-routing-v1.json'
      || godskills.outputFixture.path !== 'artifacts/specialist-preference-routing-v1/fixture.json') {
    throw new Error('Godskills preference artifact identity is invalid');
  }
  requireManifest(godskills.dependencyClosure, 'Godskills dependency closure', 13);
  if (!godskills.dependencyClosure.paths.includes(godskills.entrypoint.path)) {
    throw new Error('Godskills dependency closure lacks its entrypoint');
  }
  const gateKeys = [
    'authorityExpansions', 'equalQualityTieBreakApplied', 'legacyShapePreserved',
    'preferenceOnlyDependencyBlocked', 'rejectedPreferenceNotQualified',
    'shortlistOverflowRejected', 'strongerNonpreferredPreserved',
    'unknownPreferenceRejected', 'unresolvedDecisionPreserved',
  ];
  exactKeys(godskills.computedGates, gateKeys, 'Godskills preference gates');
  for (const [name, value] of Object.entries(godskills.computedGates)) {
    if (name === 'authorityExpansions' ? value !== 0 : value !== true) {
      throw new Error(`Godskills preference gate failed: ${name}`);
    }
  }
  if (!Array.isArray(godskills.proofLimits)
      || !godskills.proofLimits.includes('no-specialist-quality-superiority-claim')
      || !godskills.proofLimits.includes('no-eligibility-or-authority-change')) {
    throw new Error('Godskills preference proof limits are incomplete');
  }
}

function verifyFixture(fixture) {
  exactKeys(fixture, ['path', 'sha256', 'logicalDigest', 'assertions'], 'cross-repository fixture');
  if (fixture.path !== fixturePath) throw new Error('cross-repository fixture path is invalid');
  requireDigest(fixture.sha256, 'cross-repository fixture file');
  requireDigest(fixture.logicalDigest, 'cross-repository fixture logical');
  exactKeys(fixture.assertions, [
    'specialistPreferencePresent', 'allRounderPreferencePresent', 'legacyShapePreserved',
    'recoveryRouteCalls', 'recoveryPackageReproduced',
  ], 'cross-repository fixture assertions');
}

export function buildGodskillsSpecialistPreferenceIntegrationReceipt(input) {
  exactKeys(input, [
    'source', 'godskills', 'fixture', 'testRuns', 'review', 'requirementEvidence',
  ], 'specialist preference integration input');
  exactKeys(input.source, [
    'commit', 'specification', 'plan', 'implementationManifest', 'testManifest',
    'historicalReceiptDigests',
  ], 'specialist preference source');
  requireCommit(input.source.commit, 'Godagents source');
  requireBoundDocument(input.source.specification, 'specialist preference specification');
  requireBoundDocument(input.source.plan, 'specialist preference plan');
  requireManifest(input.source.implementationManifest, 'implementation manifest');
  requireManifest(input.source.testManifest, 'test manifest');
  requireHistoricalReceipts(input.source.historicalReceiptDigests);
  verifyGodskillsEvidence(input.godskills);
  verifyFixture(input.fixture);
  requireTestRuns(input.testRuns);
  exactKeys(input.review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions',
  ], 'review disposition');
  if (input.review.independent !== false) throw new Error('independent review was not performed');
  if (input.review.mode !== 'inline-adversarial'
      || !Number.isInteger(input.review.unresolvedCriticalDefects)
      || input.review.unresolvedCriticalDefects < 0
      || !Array.isArray(input.review.retainedRegressions)
      || input.review.retainedRegressions.length < 1) {
    throw new Error('inline review disposition is invalid');
  }
  exactKeys(input.requirementEvidence, requirementIds, 'requirement evidence');
  for (const id of requirementIds) {
    if (!Array.isArray(input.requirementEvidence[id]) || input.requirementEvidence[id].length === 0) {
      throw new Error(`specialist preference evidence is missing ${id}`);
    }
  }

  const fixturePass = input.fixture.assertions.specialistPreferencePresent === true
    && input.fixture.assertions.allRounderPreferencePresent === false
    && input.fixture.assertions.legacyShapePreserved === true
    && input.fixture.assertions.recoveryRouteCalls === 0
    && input.fixture.assertions.recoveryPackageReproduced === true;
  const testsPass = Object.values(input.testRuns).every(({ status }) => status === 'pass');
  const passed = testsPass && fixturePass && input.godskills.authorityExpanded === false
    && input.review.unresolvedCriticalDefects === 0;
  const requirements = requirementIds.map((id) => ({
    id,
    status: passed ? 'pass' : 'fail',
    basis: [...input.requirementEvidence[id]].sort(),
  }));
  const metrics = {
    authorityExpansions: input.godskills.authorityExpanded ? 1 : 0,
    specialistPreferencePresent: input.fixture.assertions.specialistPreferencePresent,
    allRounderPreferenceFields: input.fixture.assertions.allRounderPreferencePresent ? 1 : 0,
    legacyPreferenceFields: input.fixture.assertions.legacyShapePreserved ? 0 : 1,
    recoveryRouteCalls: input.fixture.assertions.recoveryRouteCalls,
    recoveryPackageReproduced: input.fixture.assertions.recoveryPackageReproduced,
    rejectedInlineDefectsRetained: input.review.retainedRegressions.length,
  };
  const metricEvidence = Object.fromEntries(Object.entries(preferenceBoundaryEvidence)
    .map(([name, names]) => [name, [...names]]));
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'godskills-specialist-preference-v1',
    status: requirements.every(({ status }) => status === 'pass') ? 'certified' : 'rejected',
    source: structuredClone(input.source),
    godskills: structuredClone(input.godskills),
    fixture: structuredClone(input.fixture),
    testRuns: structuredClone(input.testRuns),
    metrics,
    metricEvidence,
    review: structuredClone(input.review),
    requirements,
    proofLimits: [...proofLimits],
  };
  return Object.freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

async function preferencePin(godskillsRoot, basePin) {
  const path = join(godskillsRoot, 'receipts', 'specialist-preference-routing-v1.json');
  const bytes = await readFile(path);
  const receipt = JSON.parse(bytes.toString('utf8'));
  const unsigned = structuredClone(receipt);
  delete unsigned.receiptDigest;
  if (receipt.receiptDigest !== sha256Value(unsigned)) {
    throw new Error('Godskills preference receipt logical digest mismatch');
  }
  return {
    releasePin: {
      ...structuredClone(basePin),
      repositoryRoot: godskillsRoot,
      preference: {
        protocolId: receipt.protocolId,
        releaseReceipt: {
          path: 'receipts/specialist-preference-routing-v1.json',
          sha256: sha256Bytes(bytes),
          receiptDigest: receipt.receiptDigest,
        },
      },
    },
    receipt,
    receiptBytes: bytes,
  };
}

function hostEnvelopeFrom(policy) {
  return Object.freeze({
    ...structuredClone(policy.hostContext),
    constitutionAllowedEffects: [...policy.hostContext.permittedEffects],
    realmHandContractDigest: 'a'.repeat(64),
  });
}

function missionInput(genomePolicy, requestId, hostEnvelope) {
  return {
    mission: {
      requestId,
      text: 'resolve conflicting runtime constraints into an implementation-ready system architecture',
      authority: [...hostEnvelope.availableAuthority],
    },
    observation: { observationId: `${requestId}-observation`, counter: 0 },
    genomePolicy,
    hostEnvelope,
    sourceStateEpoch: 0,
  };
}

function projectBinding(result) {
  if (!result.receipt || !result.cortexPackage) throw new Error('deterministic preference fixture did not bind');
  return {
    status: result.status,
    selectedCapabilities: [...result.cortexPackage.selectedCapabilities],
    sourceEnvelopeDigest: result.receipt.sourceEnvelopeDigest,
    packageDigest: result.receipt.packageDigest,
    preference: result.receipt.preference ? structuredClone(result.receipt.preference) : null,
  };
}

export async function buildDeterministicSpecialistPreferenceFixture({ repositoryRoot, godskillsRoot }) {
  const root = resolve(repositoryRoot);
  const skillsRoot = resolve(godskillsRoot);
  const policy = JSON.parse(await readFile(join(root, 'fixtures', 'host-policy.json'), 'utf8'));
  const pinned = await preferencePin(skillsRoot, policy.runtime.godskillsRelease);
  const preferenceTransport = await createLocalGodskillsTransport({
    repositoryRoot: skillsRoot,
    preferenceProtocol: protocolId,
  });
  const adapter = await createGodskillsAdapter({
    releasePin: pinned.releasePin,
    transport: preferenceTransport,
  });
  const hostEnvelope = hostEnvelopeFrom(policy);
  const baseGenome = {
    protocolId: 'eternities-godskills-adapter-v1',
    preferredFamilies: ['eternities-forge'],
    prohibitedFamilies: [],
    prohibitedCapabilities: [],
    maxComposition: 3,
  };
  const specialistInput = missionInput({ ...baseGenome, profile: 'specialist' }, 'preference-fixture-specialist', hostEnvelope);
  const allRounderInput = missionInput({ ...baseGenome, profile: 'all-rounder' }, 'preference-fixture-all-rounder', hostEnvelope);
  const [specialistResult, allRounderResult] = await Promise.all([
    adapter.bindMission(specialistInput),
    adapter.bindMission(allRounderInput),
  ]);

  const legacyPin = structuredClone(pinned.releasePin);
  delete legacyPin.preference;
  const legacyTransport = await createLocalGodskillsTransport({ repositoryRoot: skillsRoot });
  const legacyAdapter = await createGodskillsAdapter({ releasePin: legacyPin, transport: legacyTransport });
  const legacyInput = missionInput({ ...baseGenome, profile: 'specialist' }, 'preference-fixture-legacy', hostEnvelope);
  const legacyResult = await legacyAdapter.bindMission(legacyInput);

  let recoveryRouteCalls = 0;
  const recoveryAdapter = await createGodskillsAdapter({
    releasePin: pinned.releasePin,
    transport: async () => {
      recoveryRouteCalls += 1;
      throw new Error('recovery must not route');
    },
  });
  const recovered = await recoveryAdapter.rehydrateMission({
    ...specialistInput,
    receipt: specialistResult.receipt,
  });
  const specialist = projectBinding(specialistResult);
  const allRounder = projectBinding(allRounderResult);
  const legacy = projectBinding(legacyResult);
  if (!specialist.preference || allRounder.preference !== null || legacy.preference !== null) {
    throw new Error('deterministic preference fixture profile isolation failed');
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    godskillsPreferenceReceipt: {
      fileSha256: sha256Bytes(pinned.receiptBytes),
      receiptDigest: pinned.receipt.receiptDigest,
    },
    specialist,
    allRounder,
    legacy,
    recovery: {
      routeCalls: recoveryRouteCalls,
      packageReproduced: recovered.receipt.packageDigest === specialistResult.receipt.packageDigest
        && canonicalJson(recovered.cortexPackage) === canonicalJson(specialistResult.cortexPackage),
    },
  };
  return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
}

async function gitText(root, commit, path) {
  const { stdout } = await execFileAsync('git', ['-C', root, 'show', `${commit}:${path}`], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  return stdout;
}

async function assertCommit(root, commit, label) {
  requireCommit(commit, label);
  try {
    await execFileAsync('git', ['-C', root, 'cat-file', '-e', `${commit}^{commit}`], { windowsHide: true });
  } catch {
    throw new Error(`${label} commit does not resolve`);
  }
}

async function manifestAtCommit(root, commit, paths) {
  const rows = [];
  for (const path of paths) {
    const text = await gitText(root, commit, path);
    rows.push({ path, sha256: sha256Text(text), bytes: Buffer.byteLength(text, 'utf8') });
  }
  return { paths: [...paths], digest: sha256Value(rows) };
}

async function historicalAtCommit(root, commit) {
  const rows = [];
  for (const path of historicalReceiptPaths) rows.push([path, sha256Text(await gitText(root, commit, path))]);
  return Object.fromEntries(rows);
}

export async function rebuildGodskillsSpecialistPreferenceIntegrationReceipt({
  repositoryRoot,
  godskillsRoot,
  sourceCommit,
  godskillsCommit,
  testRuns,
}) {
  const root = resolve(repositoryRoot);
  const skillsRoot = resolve(godskillsRoot);
  await Promise.all([
    assertCommit(root, sourceCommit, 'Godagents source'),
    assertCommit(skillsRoot, godskillsCommit, 'Godskills source'),
  ]);
  const [skillsHead, skillsOrigin] = await Promise.all([
    execFileAsync('git', ['-C', skillsRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', skillsRoot, 'rev-parse', 'origin/main'], { encoding: 'utf8', windowsHide: true }),
  ]);
  if (skillsHead.stdout.trim() !== godskillsCommit || skillsOrigin.stdout.trim() !== godskillsCommit) {
    throw new Error('Godskills preference source is not the exact pushed main checkout');
  }
  const [specification, plan, fixtureText, policyText, preferenceText] = await Promise.all([
    gitText(root, sourceCommit, specificationPath),
    gitText(root, sourceCommit, planPath),
    gitText(root, sourceCommit, fixturePath),
    gitText(root, sourceCommit, 'fixtures/host-policy.json'),
    gitText(skillsRoot, godskillsCommit, 'receipts/specialist-preference-routing-v1.json'),
  ]);
  const preferenceReceipt = JSON.parse(preferenceText);
  const preferenceUnsigned = structuredClone(preferenceReceipt);
  delete preferenceUnsigned.receiptDigest;
  if (preferenceReceipt.receiptDigest !== sha256Value(preferenceUnsigned)) {
    throw new Error('Godskills preference source receipt logical digest mismatch');
  }
  const basePin = JSON.parse(policyText).runtime.godskillsRelease;
  const releasePin = {
    ...basePin,
    repositoryRoot: skillsRoot,
    preference: {
      protocolId: preferenceReceipt.protocolId,
      releaseReceipt: {
        path: 'receipts/specialist-preference-routing-v1.json',
        sha256: sha256Text(preferenceText),
        receiptDigest: preferenceReceipt.receiptDigest,
      },
    },
  };
  const verified = await verifyGodskillsRelease(releasePin);
  const generatedFixture = await buildDeterministicSpecialistPreferenceFixture({
    repositoryRoot: root,
    godskillsRoot: skillsRoot,
  });
  if (fixtureText !== `${canonicalJson(generatedFixture)}\n`) {
    throw new Error('cross-repository specialist preference fixture is stale');
  }
  const checkedFixture = JSON.parse(fixtureText);
  const outputFixture = preferenceReceipt.outputs.find(({ path }) =>
    path === 'artifacts/specialist-preference-routing-v1/fixture.json');
  if (!outputFixture) throw new Error('Godskills preference receipt lacks its deterministic fixture');
  const review = {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    retainedRegressions: [
      'rejects recomputed preference receipts with incomplete closures',
      'rejects selected routes carrying terminal-only preference reasons',
    ],
  };
  return buildGodskillsSpecialistPreferenceIntegrationReceipt({
    source: {
      commit: sourceCommit,
      specification: { path: specificationPath, sha256: sha256Text(specification) },
      plan: { path: planPath, sha256: sha256Text(plan) },
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit),
    },
    godskills: {
      commit: godskillsCommit,
      protocolId: verified.preference.protocolId,
      authorityExpanded: verified.preference.authorityExpanded,
      releaseReceipt: {
        path: releasePin.preference.releaseReceipt.path,
        fileSha256: releasePin.preference.releaseReceipt.sha256,
        receiptDigest: verified.preference.trustRootDigest,
      },
      entrypoint: {
        path: verified.preference.entrypoint.path,
        sha256: verified.preference.entrypoint.sha256,
      },
      dependencyClosure: {
        paths: [...verified.preference.localModules],
        digest: sha256Value(verified.preference.localModules),
      },
      outputFixture: {
        path: outputFixture.path,
        fileSha256: outputFixture.sha256,
        logicalDigest: outputFixture.logicalDigest,
      },
      computedGates: structuredClone(preferenceReceipt.computedGates),
      proofLimits: structuredClone(preferenceReceipt.proofLimits),
    },
    fixture: {
      path: fixturePath,
      sha256: sha256Text(fixtureText),
      logicalDigest: checkedFixture.fixtureDigest,
      assertions: {
        specialistPreferencePresent: checkedFixture.specialist.preference !== null,
        allRounderPreferencePresent: checkedFixture.allRounder.preference !== null,
        legacyShapePreserved: checkedFixture.legacy.preference === null,
        recoveryRouteCalls: checkedFixture.recovery.routeCalls,
        recoveryPackageReproduced: checkedFixture.recovery.packageReproduced,
      },
    },
    testRuns,
    review,
    requirementEvidence,
  });
}

function runTests(files, cwd, evidenceNames = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], {
      cwd,
      shell: false,
      windowsHide: true,
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      const summary = (name) => Number(output.match(new RegExp(`(?:^|\\n)# ${name} (\\d+)(?:\\r?$|\\n)`))?.[1]);
      const tests = summary('tests');
      const passed = summary('pass');
      const failed = summary('fail');
      const skipped = summary('skipped');
      const names = [...output.matchAll(/(?:^|\n)# Subtest: ([^\r\n]+)/g)].map((match) => match[1]);
      const missing = evidenceNames.filter((name) => !names.includes(name));
      if (code !== 0 || !Number.isInteger(tests) || tests < 1 || passed !== tests
          || failed !== 0 || skipped !== 0 || names.length !== tests || missing.length > 0) {
        rejectPromise(new Error(`specialist preference test gate failed with code ${code}`));
      } else {
        const sortedEvidence = [...evidenceNames].sort();
        resolvePromise({
          status: 'pass',
          tests,
          evidenceDigest: sha256Value(sortedEvidence),
          evidenceTests: sortedEvidence,
        });
      }
    });
  });
}

async function dirtyPaths(root) {
  const outputs = await Promise.all([
    execFileAsync('git', ['-C', root, 'diff', '--name-only'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', windowsHide: true }),
  ]);
  return [...new Set(outputs.flatMap(({ stdout }) => stdout.split(/\r?\n/).filter(Boolean)))].sort();
}

async function requireCleanExcept(root, label, allowed) {
  const unexpected = (await dirtyPaths(root)).filter((path) => !allowed.includes(path));
  if (unexpected.length > 0) throw new Error(`${label} worktree has unexpected changes: ${unexpected.join(', ')}`);
}

export async function resolveSpecialistPreferenceSourceCommit({ repositoryRoot, headCommit, outputPath }) {
  const root = resolve(repositoryRoot);
  requireCommit(headCommit, 'Godagents head');
  let receipt;
  try {
    receipt = JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return headCommit;
    throw new Error('existing specialist preference receipt is invalid');
  }
  const sourceCommit = receipt.source?.commit;
  await assertCommit(root, sourceCommit, 'existing specialist preference source');
  try {
    await execFileAsync('git', ['-C', root, 'merge-base', '--is-ancestor', sourceCommit, headCommit], { windowsHide: true });
  } catch {
    throw new Error('existing specialist preference source is not an ancestor of HEAD');
  }
  const changed = (await execFileAsync(
    'git', ['-C', root, 'diff', '--name-only', '--no-renames', `${sourceCommit}..${headCommit}`],
    { encoding: 'utf8', windowsHide: true },
  )).stdout.split(/\r?\n/).filter(Boolean);
  return changed.every((path) => releaseOnlyPaths.includes(path)) ? sourceCommit : headCommit;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const skillsRoot = resolve('C:/dev/eternities-godskills');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicSpecialistPreferenceFixture({
      repositoryRoot: root,
      godskillsRoot: skillsRoot,
    });
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({ status: 'written', destination, fixtureDigest: fixture.fixtureDigest })}\n`);
    return;
  }
  await Promise.all([
    requireCleanExcept(root, 'Godagents source', releaseOnlyPaths),
    requireCleanExcept(skillsRoot, 'Godskills source', []),
  ]);
  const headCommit = (await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', windowsHide: true,
  })).stdout.trim();
  const sourceCommit = await resolveSpecialistPreferenceSourceCommit({
    repositoryRoot: root,
    headCommit,
    outputPath,
  });
  const godskillsCommit = (await execFileAsync('git', ['-C', skillsRoot, 'rev-parse', 'origin/main'], {
    encoding: 'utf8', windowsHide: true,
  })).stdout.trim();
  const [godskillsFocused, godskillsFull] = await Promise.all([
    runTests(focusedGodskillsTests, skillsRoot),
    runTests([], skillsRoot),
  ]);
  const preliminaryRuns = {
    godskillsFocused,
    godskillsFull,
    godagentsFocused: {
      status: 'pass',
      tests: requiredEvidenceTests.length,
      evidenceDigest: sha256Value(requiredEvidenceTests),
      evidenceTests: [...requiredEvidenceTests],
    },
    godagentsFull: { status: 'pass', tests: 1, evidenceDigest: sha256Value([]), evidenceTests: [] },
  };
  const preliminary = await rebuildGodskillsSpecialistPreferenceIntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot: skillsRoot,
    sourceCommit,
    godskillsCommit,
    testRuns: preliminaryRuns,
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const [godagentsFocused, godagentsFull] = await Promise.all([
    runTests(focusedGodagentsTests, root, requiredEvidenceTests),
    runTests([], root),
  ]);
  const receipt = await rebuildGodskillsSpecialistPreferenceIntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot: skillsRoot,
    sourceCommit,
    godskillsCommit,
    testRuns: { godskillsFocused, godskillsFull, godagentsFocused, godagentsFull },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
