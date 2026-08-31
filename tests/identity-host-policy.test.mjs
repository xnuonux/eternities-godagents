import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildIdentityBoundNativeTransportDescriptor } from '../src/runtime/identity-bound-native-contracts.mjs';
import { buildMissionExecutorDescriptor } from '../src/runtime/mission-phase-contracts.mjs';
import { createRoutingEvidenceActivationClassifier } from '../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../src/skills/routing-executable-verifier.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

async function policyModule() {
  try {
    return await import('../src/host/identity-policy.mjs');
  } catch (error) {
    assert.fail(`identity host policy module is unavailable: ${error.message}`);
  }
}

async function validPolicy({ reviewAvailable = true } = {}) {
  const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
  const routingPin = pinnedGodskillsRoutingExecutable();
  const verified = await verifyGodskillsRoutingExecutable({ releasePin, routingPin });
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verified,
    reviewAvailable,
  });
  return {
    schemaVersion: 1,
    policyId: 'admitted-sealed-identity-fixture-v1',
    runtime: {
      protocolId: 'eternities-admitted-sealed-identity-host-v1',
      instanceId: 'identity-host-fixture-1',
      distributionDir: '../admission/distribution',
      journalPath: '../admission/vessel/journal.jsonl',
      snapshotPath: '../admission/vessel/snapshot.json',
      hostAdapterId: 'godagents-admitted-sealed-v1',
      revocationEpoch: 0,
      godskillsRelease: releasePin,
      routingExecutable: routingPin,
      activationClassifier: structuredClone(classifier.descriptor),
      nativeTransport: buildIdentityBoundNativeTransportDescriptor({
        transportId: 'identity-host-native-v1',
        maximumDispatchBytes: 1_048_576,
        maximumCompletionBytes: 1_048_576,
      }),
      ...(reviewAvailable ? {
        reviewExecutor: buildMissionExecutorDescriptor({ executorId: 'identity-host-review-v1', phase: 'review' }),
        revisionExecutor: buildMissionExecutorDescriptor({ executorId: 'identity-host-revision-v1', phase: 'revision' }),
      } : {}),
      limits: {
        timeoutMs: 30_000,
        maximumGodskillsDispatchBytes: 1_048_576,
        maximumGodskillsCompletionBytes: 1_048_576,
        maximumGodskillsResultBytes: 1_048_576,
        maximumNativeMaterializedBytes: 1_048_576,
        maxArtifactBytes: 8192,
        nativeCompletionTokens: 1000,
        reviewCompletionTokensPerRound: 500,
        revisionCompletionTokens: 800,
        totalCompletionTokens: 2800,
        maxProjectionBytes: 65_536,
        maxCycles: 4,
      },
    },
    realmId: 'fixture-workbench',
    authority: ['local-read', 'local-write', 'realm:write'],
    hostContext: {
      permittedEffects: ['local-read', 'local-write'],
      availableAuthority: ['local-read', 'local-write', 'realm:write'],
      availablePreconditions: ['realm-observed'],
      forbiddenCapabilities: [],
      maximumRisk: 'moderate',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 16_000,
      maxCompositionSize: 3,
    },
  };
}

async function writePolicy(t, policy, name = 'identity-policy.json') {
  const root = await mkdtemp(join(tmpdir(), 'godagents-identity-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, name);
  await writeFile(path, `${canonicalJson(policy)}\n`, 'utf8');
  return path;
}

async function loadVerifiedPolicy(module, path) {
  const loaded = await module.loadIdentityHostPolicy(path);
  const verifiedRoutingExecutable = await module.verifyIdentityHostPolicyRouting(loaded.policy);
  return Object.freeze({ ...loaded, verifiedRoutingExecutable });
}

test('loads one canonical frozen identity-host policy with exact descriptor pins', async (t) => {
  const module = await policyModule();
  const policy = await validPolicy();
  const loaded = await loadVerifiedPolicy(module, await writePolicy(t, policy));

  assert.deepEqual(loaded.policy, policy);
  assert.match(loaded.digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.policy), true);
  assert.equal(Object.isFrozen(loaded.policy.runtime), true);
  assert.equal(Object.isFrozen(loaded.policy.runtime.activationClassifier), true);
  assert.equal(Object.isFrozen(loaded.policy.runtime.nativeTransport), true);
  assert.equal(Object.isFrozen(loaded.policy.runtime.reviewExecutor), true);
  assert.throws(() => { loaded.policy.authority.push('realm:admin'); }, TypeError);
});

test('accepts a no-review policy only when classifier and executor presence agree', async (t) => {
  const module = await policyModule();
  const noReview = await validPolicy({ reviewAvailable: false });
  const loaded = await loadVerifiedPolicy(module, await writePolicy(t, noReview, 'no-review.json'));
  assert.equal(loaded.policy.runtime.activationClassifier.reviewAvailable, false);
  assert.equal(Object.hasOwn(loaded.policy.runtime, 'reviewExecutor'), false);
  assert.equal(Object.hasOwn(loaded.policy.runtime, 'revisionExecutor'), false);

  for (const [name, mutate, pattern] of [
    ['review only', (policy) => { policy.runtime.reviewExecutor = buildMissionExecutorDescriptor({ executorId: 'review-only', phase: 'review' }); }, /review|revision|pair/i],
    ['revision only', (policy) => { policy.runtime.revisionExecutor = buildMissionExecutorDescriptor({ executorId: 'revision-only', phase: 'revision' }); }, /review|revision|pair/i],
    ['classifier mismatch', (policy) => { policy.runtime.activationClassifier.reviewAvailable = true; }, /classifier|descriptor|digest|review/i],
  ]) {
    const changed = structuredClone(noReview);
    mutate(changed);
    await assert.rejects(loadVerifiedPolicy(module, await writePolicy(t, changed, `${name}.json`)), pattern, name);
  }
});

test('rejects forged descriptors executable roots authority expansions and incoherent limits', async (t) => {
  const module = await policyModule();
  const base = await validPolicy();
  const cases = [
    ['classifier digest', (policy) => { policy.runtime.activationClassifier.descriptorDigest = '0'.repeat(64); }, /classifier|descriptor|digest/i],
    ['classifier routing root', (policy) => { policy.runtime.activationClassifier.routingTrustRootDigest = '0'.repeat(64); }, /classifier|routing|digest/i],
    ['routing executable', (policy) => { policy.runtime.routingExecutable.entrypoint.sha256 = '0'.repeat(64); }, /routing|digest|executable/i],
    ['native authority', (policy) => { policy.runtime.nativeTransport.authority = { tools: ['filesystem'] }; }, /authority|descriptor|field/i],
    ['wrong review phase', (policy) => { policy.runtime.reviewExecutor = buildMissionExecutorDescriptor({ executorId: 'wrong-phase', phase: 'revision' }); }, /review|phase/i],
    ['authority expansion', (policy) => { policy.authority.push('realm:admin'); }, /authority/i],
    ['composition expansion', (policy) => { policy.runtime.godskillsRelease.maximumSelected = 4; }, /maximum|composition|selected/i],
    ['artifact over transport', (policy) => { policy.runtime.limits.maxArtifactBytes = 1_048_577; }, /artifact|transport|limit|maximum/i],
    ['token total', (policy) => { policy.runtime.limits.totalCompletionTokens = 100; }, /token|total|limit/i],
    ['unknown field', (policy) => { policy.runtime.provider = { credential: 'forbidden' }; }, /provider|additionalProperties/i],
  ];
  for (const [name, mutate, pattern] of cases) {
    const changed = structuredClone(base);
    mutate(changed);
    await assert.rejects(loadVerifiedPolicy(module, await writePolicy(t, changed, `${name}.json`)), pattern, name);
  }
});

test('classifier descriptor verifier is closed and detects semantic or digest changes', async () => {
  const {
    verifyRoutingEvidenceActivationClassifierDescriptor,
  } = await import('../src/skills/routing-evidence-activation-classifier.mjs');
  const policy = await validPolicy();
  const descriptor = policy.runtime.activationClassifier;
  assert.equal(verifyRoutingEvidenceActivationClassifierDescriptor(descriptor), descriptor);
  for (const [name, mutate] of [
    ['protocol', (value) => { value.protocolId = 'other'; }],
    ['authority', (value) => { value.authorityExpanded = true; }],
    ['taxonomy', (value) => { value.taxonomyDigest = '0'.repeat(64); }],
    ['extra', (value) => { value.mode = 'method'; }],
  ]) {
    const changed = structuredClone(descriptor);
    mutate(changed);
    assert.throws(
      () => verifyRoutingEvidenceActivationClassifierDescriptor(changed),
      /classifier|descriptor|protocol|authority|digest|field/i,
      name,
    );
  }
});
