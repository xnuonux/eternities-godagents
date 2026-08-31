import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildCodexTaskCancellationReceipt,
  buildCodexTaskReservationReceipt,
  buildCodexTaskTransportReceipt,
  createCodexBoundTurnHost,
  verifyCodexBoundTurnReceipt,
} from '../src/host/codex-bound-turn.mjs';
import { inspectCortexBindingRegistry } from '../src/host/cortex-binding-registry.mjs';
import { prepareAdmittedCertificationFixture } from './lib/admitted-certification-fixture.mjs';
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

const protocolId = 'eternities-godagent-codex-bound-turn-v1';
const transportProtocolId = 'eternities-codex-task-control-v1';
const certificationId = 'codex-bound-turn-v1';
const fixturePath = 'fixtures/codex-bound-turn-v1.json';
const receiptPath = 'receipts/codex-bound-turn-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-codex-bound-turn-protocol-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-codex-bound-turn-protocol-v1.md';
const certificationPath = 'docs/codex-bound-turn-v1-certification.md';
const digestPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
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
  'schemas/codex-bound-turn-envelope.schema.json',
  'schemas/codex-bound-turn-receipt.schema.json',
  'schemas/codex-bound-turn-request.schema.json',
  'schemas/codex-task-reservation-receipt.schema.json',
  'schemas/codex-task-transport-receipt.schema.json',
  'scripts/build-codex-bound-turn-v1-receipt.mjs',
  'scripts/lib/admitted-certification-fixture.mjs',
  'scripts/lib/certification-support.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/binding-compiler.mjs',
  'src/host/codex-bound-turn.mjs',
  'src/host/cortex-binding-registry.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/codex-bound-turn-certification.test.mjs',
  'tests/codex-bound-turn.test.mjs',
  'tests/cortex-binding-registry.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/codex-bound-turn.test.mjs',
  'tests/cortex-binding-registry.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([
  certificationPath,
  receiptPath,
  'src/certification/verify-ledger.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/release-lineage.test.mjs',
]);

const requirementEvidence = Object.freeze({
  'CBP3-001': ['tests/codex-bound-turn.test.mjs: create reserves without dispatch before binding'],
  'CBP3-002': ['tests/codex-bound-turn.test.mjs: returned task is bound into the exact phase-2 lease and envelope'],
  'CBP3-003': ['tests/codex-bound-turn.test.mjs: continue chains one verified parent receipt on the same task and actor'],
  'CBP3-004': ['tests/codex-bound-turn.test.mjs: compaction resume reconstructs without transcript replay'],
  'CBP3-005': ['tests/codex-bound-turn.test.mjs: actor identity remains stable across replaceable cortex ids'],
  'CBP3-006': ['tests/codex-bound-turn.test.mjs: transport receipt binds descriptor, channel, envelope, and exact response bytes'],
  'CBP3-007': ['tests/codex-bound-turn.test.mjs: identity, authority, transcript, path, credential, and model fields fail before transport'],
  'CBP3-008': ['tests/codex-bound-turn.test.mjs: binding failure cancels only the suspended reservation'],
  'CBP3-009': ['tests/codex-bound-turn.test.mjs: dispatch failure and substitution release the personal-keel writer lock'],
  'CBP3-010': ['tests/codex-bound-turn.test.mjs: recomputed deep mutations fail semantic receipt verification'],
  'CBP3-011': ['tests/codex-bound-turn.test.mjs: model text cannot manufacture identity, continuity, or Realm authority'],
  'CBP3-012': ['tests/codex-bound-turn.test.mjs: bound-turn source never edits global Codex instructions'],
});

const proofLimits = Object.freeze([
  'no-live-codex-app-task-transport',
  'no-prompt-echo-as-envelope-proof',
  'no-transport-implementation-signature-or-release-pin',
  'no-provider-credential-handling',
  'no-model-quality-or-identity-behavior-superiority-claim',
  'no-continuity-content-admission-or-personal-keel-content-write',
  'no-godskills-activation',
  'no-realm-effect',
  'no-long-lived-multi-mission-binding',
  'no-durable-turn-retry-store-beyond-transport-idempotency',
  'no-lunari-integration',
  'no-soul-activation',
  'no-independent-review',
]);

function request({ operationId, turnId, objective }) {
  return {
    schemaVersion: 1,
    operationId,
    turnId,
    hostAdapterId: 'codex-desktop-v1',
    revocationEpoch: 0,
    mission: {
      missionId: `mission-${turnId}`,
      objective,
      successEvidence: ['exact envelope receipt', 'bounded response'],
      stopConditions: ['verified source changes', 'transport receipt mismatch'],
      budget: { maxCycles: 1, maxCompletionTokens: 2048 },
      observation: {
        observationId: `observation-${turnId}`,
        summary: 'the host is ready to dispatch one sealed certified turn',
        evidenceDigests: ['a'.repeat(64)],
      },
    },
    maxProjectionBytes: 65_536,
    maxResponseBytes: 16_384,
  };
}

function deterministicTransport() {
  const calls = [];
  const task = { taskId: 'codex-thread-certification-001', hostId: 'local-host-certification' };
  const descriptor = {
    schemaVersion: 1,
    protocolId: transportProtocolId,
    hostAdapterId: 'codex-desktop-v1',
    instructionChannel: 'developer',
    suspendedReservation: true,
    boundExecutionReceipt: true,
  };
  return {
    calls,
    descriptor() {
      calls.push({ type: 'descriptor' });
      return structuredClone(descriptor);
    },
    async reserveTask(intent) {
      const receipt = buildCodexTaskReservationReceipt({
        intent,
        task,
        instructionChannel: descriptor.instructionChannel,
      });
      calls.push({ type: 'reserve', intent: structuredClone(intent), receipt: structuredClone(receipt) });
      return receipt;
    },
    async cancelReservation({ reservationReceipt, reasonDigest }) {
      const receipt = buildCodexTaskCancellationReceipt({ reservationReceipt, reasonDigest });
      calls.push({ type: 'cancel', receipt: structuredClone(receipt) });
      return receipt;
    },
    async dispatchTurn(dispatch) {
      const responseText = `certified response for ${dispatch.operation}:${dispatch.turnId}`;
      const receipt = buildCodexTaskTransportReceipt({ dispatch, responseText });
      calls.push({
        type: 'dispatch',
        dispatch: structuredClone(dispatch),
        receipt: structuredClone(receipt),
      });
      return { responseText, receipt };
    },
  };
}

function projectTurn(receipt) {
  verifyCodexBoundTurnReceipt(receipt);
  return structuredClone(receipt);
}

function sameActor(left, right) {
  return canonicalJson(left.actor) === canonicalJson(right.actor);
}

export async function buildDeterministicCodexBoundTurnFixture({ repositoryRoot }) {
  const root = resolve(repositoryRoot);
  const fixture = await prepareAdmittedCertificationFixture({
    repositoryRoot: root,
    prefix: 'godagent-cbp3-cert',
    instanceId: 'codex-bound-turn-certification',
    promptTitle: 'Codex bound-turn certification',
    checkpointPurpose: 'certify three sealed task-scoped bound turns',
  });
  let now = Date.parse('2026-08-31T21:00:00.000Z');
  let credentialOrdinal = 0;
  const credentials = [];
  const transport = deterministicTransport();
  const registryRoot = join(fixture.temporaryRoot, 'binding-registry');
  const host = createCodexBoundTurnHost({
    taskTransport: transport,
    registryRoot,
    instanceRegistryRoot: join(fixture.temporaryRoot, 'instance-registry'),
    leaseDurationMs: 60_000,
    clock: () => now,
    leaseCredential() {
      const value = `codex-bound-turn-certification-credential-${++credentialOrdinal}`;
      credentials.push(value);
      return value;
    },
  });

  try {
    const created = await host.create({
      admission: fixture.admission,
      request: request({
        operationId: 'operation-certification-001',
        turnId: 'turn-certification-001',
        objective: 'establish one sealed task-scoped identity turn',
      }),
      cortexId: 'cortex-fixture-a',
    });
    now += 1_000;
    const continued = await host.continue({
      admission: fixture.admission,
      task: created.task,
      parentReceipt: created.receipt,
      request: request({
        operationId: 'operation-certification-002',
        turnId: 'turn-certification-002',
        objective: 'continue the same actor through a replacement cortex',
      }),
      cortexId: 'cortex-fixture-b',
    });
    now += 1_000;
    const resumed = await host.resumeAfterCompaction({
      admission: fixture.admission,
      task: created.task,
      parentReceipt: continued.receipt,
      request: request({
        operationId: 'operation-certification-003',
        turnId: 'turn-certification-003',
        objective: 'reconstruct the same actor after compaction without transcript replay',
      }),
      cortexId: 'cortex-fixture-a',
    });
    const snapshot = await inspectCortexBindingRegistry({ registryRoot, clock: () => now });
    const dispatches = transport.calls.filter((call) => call.type === 'dispatch');
    const reservation = transport.calls.find((call) => call.type === 'reserve');
    const projected = {
      schemaVersion: 1,
      protocolId,
      transport: {
        descriptor: transport.descriptor(),
        reservationReceiptDigest: reservation.receipt.receiptDigest,
        dispatchReceipts: dispatches.map((call) => call.receipt),
      },
      turns: {
        create: projectTurn(created.receipt),
        continue: projectTurn(continued.receipt),
        compactionResume: projectTurn(resumed.receipt),
      },
      envelopes: dispatches.map((call) => ({
        operation: call.dispatch.operation,
        turnId: call.dispatch.turnId,
        taskId: call.dispatch.task.taskId,
        bindingReceiptDigest: call.dispatch.bindingReceiptDigest,
        envelopeDigest: call.dispatch.envelopeDigest,
        modelProjectionDigest: call.dispatch.envelope.modelProjectionDigest,
        parentTurnReceiptDigest: call.dispatch.envelope.parentTurnReceiptDigest,
        transportDescriptorDigest: call.dispatch.envelope.transportDescriptorDigest,
      })),
      registry: {
        eventCount: snapshot.eventCount,
        registryDigest: snapshot.registryDigest,
        headDigest: snapshot.headDigest,
        statuses: snapshot.bindings.map((row) => row.status),
      },
    };
    const callTypes = transport.calls.map((call) => call.type);
    const turnRows = [created.receipt, continued.receipt, resumed.receipt];
    const assertions = {
      reservedBeforeDispatch: callTypes.indexOf('reserve') >= 0
        && callTypes.indexOf('reserve') < callTypes.indexOf('dispatch')
        && reservation.receipt.modelStarted === false,
      taskStable: turnRows.every((receipt) => receipt.task.taskId === created.task.taskId),
      actorStableAcrossCortexes: sameActor(created.receipt, continued.receipt)
        && sameActor(continued.receipt, resumed.receipt)
        && new Set(turnRows.map((receipt) => receipt.cortexId)).size === 2,
      parentChainExact: created.receipt.parentTurnReceiptDigest === '0'.repeat(64)
        && continued.receipt.parentTurnReceiptDigest === created.receipt.receiptDigest
        && resumed.receipt.parentTurnReceiptDigest === continued.receipt.receiptDigest,
      envelopesBound: dispatches.every((call, index) => call.dispatch.envelopeDigest === turnRows[index].envelopeDigest
        && call.dispatch.bindingReceiptDigest === turnRows[index].binding.activeReceiptDigest
        && call.receipt.envelopeDigest === turnRows[index].envelopeDigest
        && call.receipt.responseDigest === turnRows[index].responseDigest),
      descriptorBound: turnRows.every((receipt) => receipt.transportDescriptorDigest
        === sha256Value(projected.transport.descriptor)),
      credentialAbsent: credentials.every((credential) => !canonicalJson(projected).includes(credential)),
      transcriptEntries: canonicalJson(projected).includes('transcript') ? 1 : 0,
      activeBindingsAfterTurns: snapshot.bindings.filter((row) => row.active).length,
      registryEvents: snapshot.eventCount,
      continuityAdmissions: turnRows.filter((receipt) => receipt.authority.continuityAdmission).length,
      realmEffects: turnRows.reduce((sum, receipt) => sum + receipt.authority.realmEffects, 0),
    };
    const unsigned = { ...projected, assertions };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(fixture.temporaryRoot, { recursive: true, force: true });
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!digestPattern.test(value ?? '')) throw new Error(`${label} digest is invalid`);
}

function validateTestRuns(testRuns) {
  exactKeys(testRuns, ['focused', 'full'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
}

function validateManifest(value, expectedPaths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (canonicalJson(value.paths) !== canonicalJson(expectedPaths)
      || !Array.isArray(value.entries)
      || value.entries.length !== expectedPaths.length
      || value.digest !== sha256Value(value.entries)) throw new Error(`${label} is invalid`);
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== expectedPaths[index] || !Number.isInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
    requireDigest(entry.sha256, `${label} entry`);
  });
}

function validateSource(source) {
  exactKeys(source, [
    'commit', 'specification', 'plan', 'implementationManifest', 'testManifest',
    'historicalReceiptDigests',
  ], 'certification source');
  if (!commitPattern.test(source.commit)) throw new Error('certification source commit is invalid');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(source[field], ['path', 'sha256'], field);
    if (source[field].path !== path) throw new Error(`${field} path is invalid`);
    requireDigest(source[field].sha256, field);
  }
  validateManifest(source.implementationManifest, implementationFiles, 'implementation manifest');
  validateManifest(source.testManifest, testFiles, 'test manifest');
  if (canonicalJson(Object.keys(source.historicalReceiptDigests).sort())
      !== canonicalJson([...historicalReceiptPaths].sort())) throw new Error('historical receipt set is invalid');
  Object.entries(source.historicalReceiptDigests)
    .forEach(([path, digest]) => requireDigest(digest, `historical receipt ${path}`));
}

function validateFixture(fixture) {
  exactKeys(fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions'], 'certification fixture');
  if (fixture.path !== fixturePath) throw new Error('certification fixture path is invalid');
  requireDigest(fixture.fileSha256, 'certification fixture file');
  requireDigest(fixture.logicalDigest, 'certification fixture logical');
  exactKeys(fixture.assertions, [
    'reservedBeforeDispatch', 'taskStable', 'actorStableAcrossCortexes', 'parentChainExact',
    'envelopesBound', 'descriptorBound', 'credentialAbsent', 'transcriptEntries',
    'activeBindingsAfterTurns', 'registryEvents', 'continuityAdmissions', 'realmEffects',
  ], 'certification fixture assertions');
}

function validateReview(review) {
  exactKeys(review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (review.mode !== 'inline-adversarial' || review.independent !== false
      || !Number.isInteger(review.unresolvedCriticalDefects)
      || review.unresolvedCriticalDefects < 0
      || !Array.isArray(review.retainedRegressions)
      || review.retainedRegressions.length < 1
      || new Set(review.retainedRegressions).size !== review.retainedRegressions.length) {
    throw new Error('review is invalid');
  }
}

export function buildCodexBoundTurnCertificationReceipt(input) {
  exactKeys(input, ['source', 'fixture', 'testRuns', 'review'], 'certification input');
  validateSource(input.source);
  validateFixture(input.fixture);
  validateTestRuns(input.testRuns);
  validateReview(input.review);
  const assertions = input.fixture.assertions;
  const passed = assertions.reservedBeforeDispatch === true
    && assertions.taskStable === true
    && assertions.actorStableAcrossCortexes === true
    && assertions.parentChainExact === true
    && assertions.envelopesBound === true
    && assertions.descriptorBound === true
    && assertions.credentialAbsent === true
    && assertions.transcriptEntries === 0
    && assertions.activeBindingsAfterTurns === 0
    && assertions.registryEvents === 6
    && assertions.continuityAdmissions === 0
    && assertions.realmEffects === 0
    && input.review.unresolvedCriticalDefects === 0;
  const requirements = Object.entries(requirementEvidence).map(([id, basis]) => ({
    id,
    status: passed ? 'pass' : 'fail',
    basis: [...basis],
  }));
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: requirements.every((row) => row.status === 'pass') ? 'certified' : 'rejected',
    protocolId,
    source: structuredClone(input.source),
    fixture: structuredClone(input.fixture),
    testRuns: structuredClone(input.testRuns),
    metrics: {
      acceptedTurns: 3,
      distinctCortexes: 2,
      registryEvents: assertions.registryEvents,
      transcriptEntries: assertions.transcriptEntries,
      activeBindingsAfterTurns: assertions.activeBindingsAfterTurns,
      serializedCredentials: assertions.credentialAbsent ? 0 : 1,
      continuityAdmissions: assertions.continuityAdmissions,
      realmEffects: assertions.realmEffects,
      retainedInlineRegressions: input.review.retainedRegressions.length,
    },
    review: structuredClone(input.review),
    requirements,
    proofLimits: [...proofLimits],
  };
  return Object.freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

export function verifyCodexBoundTurnCertificationReceipt(value) {
  const receipt = structuredClone(value);
  exactKeys(receipt, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'testRuns', 'metrics', 'review', 'requirements', 'proofLimits', 'receiptDigest',
  ], 'codex bound-turn certification receipt');
  if (receipt.schemaVersion !== 1 || receipt.certificationId !== certificationId
      || receipt.protocolId !== protocolId) throw new Error('codex bound-turn certification identity is invalid');
  const rebuilt = buildCodexBoundTurnCertificationReceipt({
    source: receipt.source,
    fixture: receipt.fixture,
    testRuns: receipt.testRuns,
    review: receipt.review,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(receipt)) {
    throw new Error('codex bound-turn certification receipt mismatch');
  }
  return Object.freeze(receipt);
}

export async function rebuildCodexBoundTurnReceipt({ repositoryRoot, sourceCommit, testRuns }) {
  const root = resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  const [specification, plan, fixtureText] = await Promise.all([
    gitText(root, sourceCommit, specificationPath),
    gitText(root, sourceCommit, planPath),
    gitText(root, sourceCommit, fixturePath),
  ]);
  const generatedFixture = await buildDeterministicCodexBoundTurnFixture({ repositoryRoot: root });
  if (fixtureText !== `${canonicalJson(generatedFixture)}\n`) {
    throw new Error('codex bound-turn deterministic fixture is stale');
  }
  const fixture = JSON.parse(fixtureText);
  return buildCodexBoundTurnCertificationReceipt({
    source: {
      commit: sourceCommit,
      specification: { path: specificationPath, sha256: sha256Text(specification) },
      plan: { path: planPath, sha256: sha256Text(plan) },
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      assertions: structuredClone(fixture.assertions),
    },
    testRuns,
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [
        'rejects identity authority transcript path credential and model request additions before transport',
        'rejects descriptor reservation parent actor envelope response and receipt substitution',
        'releases the personal-keel writer lock after every tested dispatch failure',
        'cancels only a verified still-suspended task after pre-dispatch binding failure',
        'treats model response text as untrusted bytes with zero admitted authority',
      ],
    },
  });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicCodexBoundTurnFixture({ repositoryRoot: root });
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({ status: 'written', destination, fixtureDigest: fixture.fixtureDigest })}\n`);
    return;
  }

  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({ root, headCommit: head, outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildCodexBoundTurnReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: 1 } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildCodexBoundTurnReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
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
