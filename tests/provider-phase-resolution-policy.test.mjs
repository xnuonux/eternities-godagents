import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import {
  buildProviderPhaseResponseWitness,
  loadProviderPhaseResolutionPolicy,
  verifyProviderPhaseResolutionDecision,
  verifyProviderPhaseResponseWitness,
} from '../src/transports/provider-phase-resolution.mjs';
import {
  signProviderResolutionDecision,
  unsignedProviderResolutionDecision,
  validProviderPhaseResolutionPolicy,
} from './helpers/provider-phase-resolution-fixture.mjs';

async function policyFixture(t, policy = validProviderPhaseResolutionPolicy()) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-provider-resolution-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'resolution-policy.json');
  const digest = sha256Text(canonicalJson(policy));
  await writeFile(path, `${canonicalJson(policy)}\n`, 'utf8');
  return { path, digest, policy };
}

test('loads one canonical externally pinned provider resolution policy bound to one transport', async (t) => {
  const fixture = await policyFixture(t);
  const loaded = await loadProviderPhaseResolutionPolicy({
    path: fixture.path,
    env: { GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: fixture.digest },
    transportPolicyDigest: '1'.repeat(64),
    maximumProviderResponseBytes: 1_048_576,
  });
  assert.equal(loaded.digest, fixture.digest);
  assert.equal(loaded.policy.protocolId, 'eternities-provider-phase-resolution-policy-v1');
  assert.equal(loaded.publicKey.asymmetricKeyType, 'ed25519');
  assert.equal(Object.isFrozen(loaded.policy), true);
});

test('rejects pin transport key lifetime ceiling and canonical-form drift before authority is usable', async (t) => {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cases = [
    ['pin', validProviderPhaseResolutionPolicy(), { pin: 'f'.repeat(64) }],
    ['transport', validProviderPhaseResolutionPolicy(), { transport: 'e'.repeat(64) }],
    ['key', {
      ...validProviderPhaseResolutionPolicy(),
      authority: {
        algorithm: 'Ed25519',
        keyId: 'fixture-provider-resolution-authority-v1',
        publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      },
    }, {}],
    ['lifetime', { ...validProviderPhaseResolutionPolicy(), maximumDecisionLifetimeMs: 999 }, {}],
    ['ceiling', validProviderPhaseResolutionPolicy({ maximumAdoptedResponseBytes: 1_048_577 }), {}],
  ];
  for (const [name, policy, overrides] of cases) {
    const fixture = await policyFixture(t, policy);
    await assert.rejects(() => loadProviderPhaseResolutionPolicy({
      path: fixture.path,
      env: { GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: overrides.pin ?? fixture.digest },
      transportPolicyDigest: overrides.transport ?? '1'.repeat(64),
      maximumProviderResponseBytes: 1_048_576,
    }), /provider phase resolution policy/i, name);
  }

  const noncanonical = await policyFixture(t);
  await writeFile(noncanonical.path, `${JSON.stringify(noncanonical.policy, null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => loadProviderPhaseResolutionPolicy({
      path: noncanonical.path,
      env: { GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: noncanonical.digest },
      transportPolicyDigest: '1'.repeat(64),
      maximumProviderResponseBytes: 1_048_576,
    }),
    (error) => error?.code === 'policy-integrity'
      && !error.message.includes(noncanonical.path)
      && !error.message.includes(noncanonical.digest),
  );
});

test('builds and verifies one exact provider-neutral response witness from raw response bytes', () => {
  const response = {
    status: 200,
    headers: { 'content-type': ' Application/JSON ; Charset=UTF-8 ' },
    bodyText: '{"content":"exact"}',
  };
  const witness = buildProviderPhaseResponseWitness(response);
  assert.deepEqual(witness, {
    schemaVersion: 1,
    protocolId: 'eternities-provider-phase-response-witness-v1',
    status: 200,
    contentType: 'application/json ; charset=utf-8',
    bodyBytes: 19,
    bodySha256: sha256Text(response.bodyText),
    witnessDigest: witness.witnessDigest,
  });
  assert.equal(verifyProviderPhaseResponseWitness(witness).witnessDigest, witness.witnessDigest);
  assert.throws(
    () => verifyProviderPhaseResponseWitness({ ...witness, bodyBytes: 18 }),
    /provider phase resolution decision/i,
  );
});

test('verifies exact signed abandonment and rejects time signature and operation drift', async (t) => {
  const fixture = await policyFixture(t);
  const loaded = await loadProviderPhaseResolutionPolicy({
    path: fixture.path,
    env: { GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: fixture.digest },
    transportPolicyDigest: '1'.repeat(64),
    maximumProviderResponseBytes: 1_048_576,
  });
  const operation = {
    phase: 'native',
    dispatchDigest: '3'.repeat(64),
    requestDigest: '4'.repeat(64),
    attemptId: '5'.repeat(64),
  };
  const signedDecision = signProviderResolutionDecision(
    unsignedProviderResolutionDecision({ policyDigest: fixture.digest }),
  );
  assert.equal(verifyProviderPhaseResolutionDecision({
    signedDecision,
    loadedPolicy: loaded,
    operation,
    responseWitnessDigest: null,
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  }).decision.disposition, 'abandon');

  for (const [name, changed] of [
    ['expired', { now: Date.parse('2026-08-31T20:06:00.000Z') }],
    ['operation', { operation: { ...operation, attemptId: '6'.repeat(64) } }],
    ['response', { responseWitnessDigest: '7'.repeat(64) }],
  ]) {
    assert.throws(() => verifyProviderPhaseResolutionDecision({
      signedDecision,
      loadedPolicy: loaded,
      operation,
      responseWitnessDigest: null,
      now: Date.parse('2026-08-31T20:02:00.000Z'),
      ...changed,
    }), /provider phase resolution decision/i, name);
  }

  const tampered = structuredClone(signedDecision);
  tampered.signature = Buffer.alloc(64).toString('base64');
  assert.throws(() => verifyProviderPhaseResolutionDecision({
    signedDecision: tampered,
    loadedPolicy: loaded,
    operation,
    responseWitnessDigest: null,
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  }), /provider phase resolution decision/i);
});

test('requires adoption to bind the exact witness and forbids a witness on abandonment', async (t) => {
  const fixture = await policyFixture(t);
  const loaded = await loadProviderPhaseResolutionPolicy({
    path: fixture.path,
    env: { GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: fixture.digest },
    transportPolicyDigest: '1'.repeat(64),
    maximumProviderResponseBytes: 1_048_576,
  });
  const operation = {
    phase: 'native',
    dispatchDigest: '3'.repeat(64),
    requestDigest: '4'.repeat(64),
    attemptId: '5'.repeat(64),
  };
  const witnessDigest = '7'.repeat(64);
  const adoption = signProviderResolutionDecision(unsignedProviderResolutionDecision({
    policyDigest: fixture.digest,
    disposition: 'adopt-response',
    responseWitnessDigest: witnessDigest,
  }));
  assert.equal(verifyProviderPhaseResolutionDecision({
    signedDecision: adoption,
    loadedPolicy: loaded,
    operation,
    responseWitnessDigest: witnessDigest,
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  }).decision.responseWitnessDigest, witnessDigest);
  assert.throws(() => verifyProviderPhaseResolutionDecision({
    signedDecision: adoption,
    loadedPolicy: loaded,
    operation,
    responseWitnessDigest: '8'.repeat(64),
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  }), /provider phase resolution decision/i);
});
