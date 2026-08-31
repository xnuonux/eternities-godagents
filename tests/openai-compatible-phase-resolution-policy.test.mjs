import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import {
  loadOpenAICompatiblePhaseResolutionPolicy,
  verifyOpenAICompatiblePhaseResolutionDecision,
} from '../src/transports/openai-compatible-phase-resolution.mjs';
import {
  signResolutionDecision,
  unsignedResolutionDecision,
  validOpenAICompatiblePhaseResolutionPolicy,
} from './helpers/openai-compatible-phase-resolution-fixture.mjs';

async function policyFixture(t, policy = validOpenAICompatiblePhaseResolutionPolicy()) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-phase-resolution-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'resolution-policy.json');
  const digest = sha256Text(canonicalJson(policy));
  await writeFile(path, `${canonicalJson(policy)}\n`, 'utf8');
  return { path, digest, policy };
}

test('loads one canonical pinned Ed25519 resolution policy bound to the exact transport policy', async (t) => {
  const fixture = await policyFixture(t);
  const loaded = await loadOpenAICompatiblePhaseResolutionPolicy({
    path: fixture.path,
    env: { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: fixture.digest },
    transportPolicyDigest: '1'.repeat(64),
    maximumProviderResponseBytes: 1_048_576,
  });
  assert.equal(loaded.digest, fixture.digest);
  assert.equal(loaded.policy.transportPolicyDigest, '1'.repeat(64));
  assert.equal(loaded.publicKey.asymmetricKeyType, 'ed25519');
  assert.equal(Object.isFrozen(loaded.policy), true);
});

test('rejects policy pin drift transport drift invalid keys and over-broad ceilings', async (t) => {
  const cases = [
    ['pin drift', validOpenAICompatiblePhaseResolutionPolicy(), { pin: 'f'.repeat(64) }],
    ['transport drift', validOpenAICompatiblePhaseResolutionPolicy(), { transport: 'e'.repeat(64) }],
    ['invalid key', {
      ...validOpenAICompatiblePhaseResolutionPolicy(),
      authority: { algorithm: 'Ed25519', keyId: 'fixture-resolution-authority-v1', publicKeySpki: 'bm90LWEtcHVibGljLWtleQ==' },
    }, {}],
    ['response ceiling', {
      ...validOpenAICompatiblePhaseResolutionPolicy(),
      maximumAdoptedResponseBytes: 1_048_577,
    }, {}],
  ];
  for (const [name, policy, overrides] of cases) {
    const fixture = await policyFixture(t, policy);
    await assert.rejects(
      () => loadOpenAICompatiblePhaseResolutionPolicy({
        path: fixture.path,
        env: { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: overrides.pin ?? fixture.digest },
        transportPolicyDigest: overrides.transport ?? '1'.repeat(64),
        maximumProviderResponseBytes: 1_048_576,
      }),
      /resolution policy/i,
      name,
    );
  }
});

test('rejects noncanonical policy without disclosing its path or expected pin', async (t) => {
  const fixture = await policyFixture(t);
  await writeFile(fixture.path, `${JSON.stringify(fixture.policy, null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => loadOpenAICompatiblePhaseResolutionPolicy({
      path: fixture.path,
      env: { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: fixture.digest },
      transportPolicyDigest: '1'.repeat(64),
      maximumProviderResponseBytes: 1_048_576,
    }),
    (error) => {
      assert.equal(error.code, 'policy-integrity');
      assert.doesNotMatch(error.message, new RegExp(fixture.path.replaceAll('\\', '\\\\'), 'i'));
      assert.doesNotMatch(error.message, new RegExp(fixture.digest, 'i'));
      return true;
    },
  );
});

test('verifies one exact signed decision and rejects tampering wrong time and cross-operation replay', async (t) => {
  const fixture = await policyFixture(t);
  const loaded = await loadOpenAICompatiblePhaseResolutionPolicy({
    path: fixture.path,
    env: { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: fixture.digest },
    transportPolicyDigest: '1'.repeat(64),
    maximumProviderResponseBytes: 1_048_576,
  });
  const operation = {
    phase: 'native',
    dispatchDigest: '3'.repeat(64),
    requestDigest: '4'.repeat(64),
    attemptId: '5'.repeat(64),
  };
  const signed = signResolutionDecision(unsignedResolutionDecision({ policyDigest: fixture.digest }));
  const verified = verifyOpenAICompatiblePhaseResolutionDecision({
    signedDecision: signed,
    loadedPolicy: loaded,
    operation,
    responseDigest: null,
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  });
  assert.equal(verified.decision.decisionDigest, signed.decision.decisionDigest);
  assert.equal(verified.decision.disposition, 'abandon');

  const tampered = structuredClone(signed);
  tampered.decision.nonce = 'changed';
  const wrongSizedSignature = structuredClone(signed);
  wrongSizedSignature.signature = Buffer.alloc(63).toString('base64');
  const overlong = signResolutionDecision(unsignedResolutionDecision({
    policyDigest: fixture.digest,
    expiresAt: '2026-08-31T20:05:00.001Z',
  }));
  for (const [name, value, overrides] of [
    ['tampered', tampered, {}],
    ['wrong-sized signature', wrongSizedSignature, {}],
    ['overlong', overlong, {}],
    ['expired', signed, { now: Date.parse('2026-08-31T20:06:00.000Z') }],
    ['future', signed, { now: Date.parse('2026-08-31T19:59:59.000Z') }],
    ['cross operation', signed, { operation: { ...operation, attemptId: '6'.repeat(64) } }],
  ]) {
    assert.throws(
      () => verifyOpenAICompatiblePhaseResolutionDecision({
        signedDecision: value,
        loadedPolicy: loaded,
        operation: overrides.operation ?? operation,
        responseDigest: null,
        now: overrides.now ?? Date.parse('2026-08-31T20:02:00.000Z'),
      }),
      /resolution decision/i,
      name,
    );
  }

  const { publicKey: wrongPublicKey } = generateKeyPairSync('ed25519');
  const wrongKeyPolicy = validOpenAICompatiblePhaseResolutionPolicy();
  wrongKeyPolicy.authority.publicKeySpki = wrongPublicKey.export({
    format: 'der',
    type: 'spki',
  }).toString('base64');
  const wrongKeyFixture = await policyFixture(t, wrongKeyPolicy);
  const wrongKeyLoaded = await loadOpenAICompatiblePhaseResolutionPolicy({
    path: wrongKeyFixture.path,
    env: { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: wrongKeyFixture.digest },
    transportPolicyDigest: '1'.repeat(64),
    maximumProviderResponseBytes: 1_048_576,
  });
  const wrongKeyDecision = signResolutionDecision(unsignedResolutionDecision({
    policyDigest: wrongKeyFixture.digest,
  }));
  assert.throws(
    () => verifyOpenAICompatiblePhaseResolutionDecision({
      signedDecision: wrongKeyDecision,
      loadedPolicy: wrongKeyLoaded,
      operation,
      responseDigest: null,
      now: Date.parse('2026-08-31T20:02:00.000Z'),
    }),
    /resolution decision/i,
  );
});

test('requires response adoption to bind one exact response witness and forbids one on abandonment', async (t) => {
  const fixture = await policyFixture(t);
  const loaded = await loadOpenAICompatiblePhaseResolutionPolicy({
    path: fixture.path,
    env: { GODAGENT_PHASE_RESOLUTION_POLICY_SHA256: fixture.digest },
    transportPolicyDigest: '1'.repeat(64),
    maximumProviderResponseBytes: 1_048_576,
  });
  const operation = {
    phase: 'native',
    dispatchDigest: '3'.repeat(64),
    requestDigest: '4'.repeat(64),
    attemptId: '5'.repeat(64),
  };
  const responseDigest = '7'.repeat(64);
  const adoption = signResolutionDecision(unsignedResolutionDecision({
    policyDigest: fixture.digest,
    disposition: 'adopt-response',
    responseDigest,
  }));
  assert.equal(verifyOpenAICompatiblePhaseResolutionDecision({
    signedDecision: adoption,
    loadedPolicy: loaded,
    operation,
    responseDigest,
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  }).decision.disposition, 'adopt-response');
  assert.throws(() => verifyOpenAICompatiblePhaseResolutionDecision({
    signedDecision: adoption,
    loadedPolicy: loaded,
    operation,
    responseDigest: '8'.repeat(64),
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  }), /resolution decision/i);
  assert.throws(() => verifyOpenAICompatiblePhaseResolutionDecision({
    signedDecision: signResolutionDecision(unsignedResolutionDecision({
      policyDigest: fixture.digest,
      responseDigest,
    })),
    loadedPolicy: loaded,
    operation,
    responseDigest,
    now: Date.parse('2026-08-31T20:02:00.000Z'),
  }), /resolution decision/i);
});
