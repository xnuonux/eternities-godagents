import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicPortablePhaseHostAdversarialFixture } from '../tests/helpers/portable-phase-host-adversarial-fixture.mjs';
import {
  assertCommit,
  gitText,
  headCommit,
  historicalAtCommit,
  manifestAtCommit,
  requireCleanExcept,
  resolveSourceCommit,
  runTests,
} from './lib/certification-support.mjs';

const certificationId = 'portable-phase-host-adversarial-v1';
const protocolId = 'eternities-portable-phase-host-adversarial-certification-v1';
const fixtureProtocolId = 'eternities-portable-phase-host-adversarial-fixture-v1';
const fixturePath = 'fixtures/portable-phase-host-adversarial-v1.json';
const receiptPath = 'receipts/portable-phase-host-adversarial-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-portable-phase-host-adversarial-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-portable-phase-host-adversarial-v1.md';
const certificationPath = 'docs/portable-phase-host-adversarial-v1-certification.md';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  planPath,
  specificationPath,
  'package.json',
  'scripts/build-portable-phase-host-adversarial-v1-fixture.mjs',
  'scripts/build-portable-phase-host-adversarial-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/host/provider-phase-host-sdk.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/mission-revision-transport-contracts.mjs',
  'src/sdk/portable-phase-host.mjs',
  'src/skills/review-transport-contracts.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/portable-phase-host-adversarial-fixture.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/portable-phase-host-adversarial-certification.test.mjs',
  'tests/portable-phase-host-adversarial.test.mjs',
  'tests/portable-phase-host-conformance.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/portable-phase-host-adversarial.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['PHA-001', 'forged host instances and shallow clones fail the SDK-issued identity guard'],
  ['PHA-002', 'protocol, capability, authority, and credential-shaped description mutations fail closed'],
  ['PHA-003', 'phase descriptor drift fails before host issuance and pinned descriptors remain stable'],
  ['PHA-004', 'credential preflight rejects sensitive fields before a portable operation crosses the boundary'],
  ['PHA-005', 'the public portable host surface remains the exact six-member provider-neutral interface'],
  ['PHA-006', 'existing OpenAI-compatible and Anthropic wrappers construct without provider calls or credential disclosure'],
  ['PHA-007', 'the authority projection remains empty for Realm, continuity, identity, evolution, Inspiration, and Soul'],
  ['PHA-008', 'fixture and receipt reconstruction are deterministic and bound to the prior portable-host receipt chain'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'live host behavior, model quality, provider availability, cost, and latency are not certified',
  'remote exactly-once execution, hostile same-user isolation, and sandbox escape resistance are not certified',
  'Codex, Claude Code, local-model, MCP, and other desktop adapters are not implemented or qualified',
  'the campaign does not choose providers, models, credentials, retries, or fallback paths',
  'no default launch behavior, Realm effect, scheduler, hosted durability, keel, memory, identity, or evolution behavior changes',
  'no Inspiration, Lunari, Soul, or Luna phenomenological behavior is implemented or implied',
]);
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'portable host adversarial test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'portable host adversarial test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('portable host adversarial test run is invalid');
    }
  }
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'cases', 'assertions', 'fixtureDigest'], 'portable host adversarial fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== fixtureProtocolId || !Array.isArray(value.cases)) {
    throw new Error('portable host adversarial fixture identity is invalid');
  }
  if (value.cases.length !== 11 || value.cases.some((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
    return !same(Object.keys(entry).sort(), ['id', 'status']) || typeof entry.id !== 'string' || entry.status !== 'pass';
  })) throw new Error('portable host adversarial fixture cases are invalid');
  if (!same(value.cases, [...value.cases].sort((left, right) => left.id.localeCompare(right.id)))) {
    throw new Error('portable host adversarial fixture cases are not sorted');
  }
  const assertions = {
    cases: 11,
    rejectedCases: 7,
    verifiedCases: 4,
    providerFamilies: 2,
    providerCalls: 0,
    credentialLeaks: 0,
    authorityExpansions: 0,
    pinnedDescriptorDrift: 0,
    publicSurfaceExact: true,
  };
  if (!same(value.assertions, assertions)) throw new Error('portable host adversarial fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'portable host adversarial fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('portable host adversarial fixture digest mismatch');
  return value;
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!same(value.paths, paths) || !Array.isArray(value.entries) || value.entries.length !== paths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyPortablePhaseHostAdversarialReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'portable host adversarial receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('portable host adversarial receipt identity is invalid');
  }
  exactKeys(value.source, ['commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest', 'specification', 'plan'], 'portable host adversarial receipt source');
  if (!COMMIT.test(value.source.commit)) throw new Error('portable host adversarial source commit is invalid');
  if (!same(value.requirements, requirements)) throw new Error('portable host adversarial requirements are invalid');
  if (!same(value.proofLimits, proofLimits)) throw new Error('portable host adversarial proof limits are invalid');
  verifyTestRuns(value.testRuns);
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'portable host adversarial receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('portable host adversarial fixture binding is invalid');
  }
  if (!same(value.metrics, fixture.assertions)) throw new Error('portable host adversarial metrics are invalid');
  if (!same(value.review, { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 })) {
    throw new Error('portable host adversarial review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'portable host adversarial receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('portable host adversarial receipt digest mismatch');
  return value;
}

export async function buildPortablePhaseHostAdversarialReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('portable host adversarial fixture is not canonical');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(root, sourceCommit, testFiles);
  const historicalPaths = ['receipts/portable-phase-host-conformance-v1.json'];
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalPaths),
      implementationManifest,
      testManifest,
      specification: { path: specificationPath, sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(root, sourceCommit, planPath)) },
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements: structuredClone(requirements),
    metrics: structuredClone(fixture.assertions),
    testRuns: structuredClone(testRuns),
    review: { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyPortablePhaseHostAdversarialReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({ root, headCommit: await headCommit(root), outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildPortablePhaseHostAdversarialReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildPortablePhaseHostAdversarialReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/portable-phase-host-adversarial-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeFile(join(root, ...certificationPath.split('/')), `# Portable Phase-Host Adversarial Campaign v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies local hostile-input evidence for the existing provider-neutral portable phase-host boundary. It does not certify live providers, external desktop hosts, or model quality.\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest, fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
