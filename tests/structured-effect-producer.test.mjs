import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { sha256Value } from '../src/core/digest.mjs';
import {
  localArtifactEffectProducer, prepareLocalArtifactEffectRequest,
  verifyLocalArtifactEffectRequest,
} from '../src/host/structured-effect-producer.mjs';

function subject() {
  return {
    schemaVersion: 2, routeMode: 'effect-only',
    task: { taskId: 'effect-task', hostAdapterId: 'artifact-host', revocationEpoch: 0 },
    mission: { missionId: 'effect-mission', objective: 'produce a bounded artifact',
      successEvidence: ['artifact accepted'], stopConditions: ['authority denied'] },
    observation: { observationId: 'effect-observation', summary: 'input ready', evidenceDigests: [] },
    requestedAuthority: ['local-read', 'local-write'], explicitMethodRequests: [],
    hostCeiling: { availableAuthority: ['local-read', 'local-write'],
      permittedEffects: ['local-read', 'local-write'], availablePreconditions: [],
      forbiddenCapabilities: [], maximumRisk: 'low', minimumEvidenceConfidence: 'verified',
      contextBudget: 6000, maxCompositionSize: 3 },
    budgets: { maxArtifactBytes: 1024, nativeCompletionTokens: 1000,
      reviewCompletionTokensPerRound: 500, revisionCompletionTokens: 800, totalCompletionTokens: 2800 },
    sourceStateEpoch: 0, maxCycles: 4, maxProjectionBytes: 16000,
  };
}
// Frozen from independently ordered JSON and node:crypto, not the producer.
const producerDigest = 'bd00071f046bd5f8612a65cfe674d417b8b21c3fb25bad41634bb734b08bfc26';
const trusted = () => ({ expectedProducerDescriptorDigest: producerDigest });

test('producer matches the independently generated cross-repository digest vector', async () => {
  const vector = JSON.parse(await readFile(new URL('../fixtures/effect-only-golden-vector-v2.json', import.meta.url), 'utf8'));
  const result = prepareLocalArtifactEffectRequest(vector.subject, trusted());
  assert.deepEqual(result.effectAssessment, vector.effectAssessment);
  assert.equal(result.effectAssessment.subjectDigest, 'f82be214b317cd90a4b4ea060f0d5b7322fd2088878e8e9af9eb5b58a4616655');
  assert.equal(sha256Value(result.effectAssessment), '2d996007d2fd5692e3760aede8b28f6a018723785bdc7148282bd75d64a2918d');
  assert.equal(sha256Value(vector.request), 'a8e6adad64894409b3b5aee6a57f37abc7333b990b05cc4f04dc487a7c20a11a');
});

test('structured producer binds the whole request and declares artifact effects without a skill', () => {
  const original = subject();
  const result = prepareLocalArtifactEffectRequest(original, trusted());
  assert.deepEqual(result.effectAssessment.requestedEffects, ['local-read', 'local-write']);
  assert.equal(result.effectAssessment.state, 'known');
  assert.equal(result.effectAssessment.producerDescriptorDigest, producerDigest);
  assert.equal(sha256Value(localArtifactEffectProducer), producerDigest);
  assert.deepEqual(result.effectAssessment.unresolvedDecisions, []);
  assert.equal(result.effectAssessment.subjectDigest, sha256Value(original));
  assert.equal(Object.hasOwn(original, 'effectAssessment'), false);
  assert.deepEqual(verifyLocalArtifactEffectRequest(result, trusted()), result);
  assert.equal(Object.isFrozen(result.effectAssessment.requestedEffects), true);
});

test('missing or untrusted producer pin cannot mint or verify a declaration', () => {
  assert.throws(() => prepareLocalArtifactEffectRequest(subject()), /producer/);
  assert.throws(() => prepareLocalArtifactEffectRequest(subject(), {
    expectedProducerDescriptorDigest: 'f'.repeat(64),
  }), /producer/);
  const result = prepareLocalArtifactEffectRequest(subject(), trusted());
  assert.throws(() => verifyLocalArtifactEffectRequest(result), /producer/);
});

test('known write intent is not silently intersected with read-only permissions', () => {
  const input = subject();
  input.requestedAuthority = ['local-read'];
  input.hostCeiling.availableAuthority = ['local-read'];
  input.hostCeiling.permittedEffects = ['local-read'];
  const result = prepareLocalArtifactEffectRequest(input, trusted());
  assert.deepEqual(result.effectAssessment.requestedEffects, ['local-read', 'local-write']);
  assert.deepEqual(result.hostCeiling.permittedEffects, ['local-read']);
  assert.deepEqual(result.requestedAuthority, ['local-read']);
});

for (const [name, mutate] of [
  ['objective', r => { r.mission.objective = 'changed'; }],
  ['observation', r => { r.observation.summary = 'changed'; }],
  ['epoch', r => { r.sourceStateEpoch++; }],
  ['budget', r => { r.budgets.maxArtifactBytes++; }],
  ['mode', r => { r.routeMode = 'automatic'; }],
  ['version', r => { r.schemaVersion = 3; }],
  ['effect omission', r => { r.effectAssessment.requestedEffects = ['local-read']; }],
  ['unknown field', r => { r.effectAssessment.origin = 'host'; }],
  ['producer', r => { r.effectAssessment.producerDescriptorDigest = '0'.repeat(64); }],
  ['protocol', r => { r.effectAssessment.protocolId = 'future'; }],
  ['state', r => { r.effectAssessment.state = 'unknown'; }],
]) {
  test(`changed ${name} cannot reuse a structured declaration`, () => {
    const result = structuredClone(prepareLocalArtifactEffectRequest(subject(), trusted()));
    mutate(result);
    assert.throws(() => verifyLocalArtifactEffectRequest(result, trusted()));
  });
}

test('producer rejects preexisting assessment and does not mutate caller state', () => {
  const prepared = prepareLocalArtifactEffectRequest(subject(), trusted());
  assert.throws(() => prepareLocalArtifactEffectRequest(prepared, trusted()), /assessment/);
  const copy = structuredClone(prepared);
  const verified = verifyLocalArtifactEffectRequest(copy, trusted());
  copy.observation.summary = 'caller changed';
  assert.equal(verified.observation.summary, 'input ready');
});
