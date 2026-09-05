import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import {
  buildPortablePhaseHostDescription,
  createPortablePhaseHostAdapter,
} from '../src/sdk/portable-phase-host.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';

async function loadSubject() {
  try {
    return await import('../src/host/portable-mission-dependencies.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

async function portableHost(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-portable-dependencies-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = validOpenAICompatiblePhasePolicy();
  const policyPath = join(root, 'provider-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  const secret = 'portable-dependencies-secret-canary';
  let providerCalls = 0;
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const provider = await createProviderPhaseHost({
    family: 'openai-compatible-chat-completions-v1',
    policyPath,
    runtimeRoot: join(root, 'provider-operations'),
    env: {
      GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: policyDigest,
      [policy.provider.credentialEnv]: secret,
    },
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error('portable dependency construction must not call the provider');
    },
  });
  const description = buildPortablePhaseHostDescription({
    adapterId: 'provider-wrapper-for-portable-dependencies',
    adapterVersion: '1',
    policyDigest,
    descriptors: provider.describe().descriptors,
  });
  const host = await createPortablePhaseHostAdapter({
    description,
    native: provider.native,
    review: provider.review,
    revision: provider.revision,
    assertCredentialAbsent: provider.assertCredentialAbsent,
    createOperatorResolutionController: provider.createOperatorResolutionController,
  });
  return { host, secret, get providerCalls() { return providerCalls; } };
}

test('one SDK-issued portable host becomes one frozen, body-free dependency bundle', async (t) => {
  const subject = await loadSubject();
  assert.equal(typeof subject.createPortableMissionDependencies, 'function');
  assert.equal(typeof subject.verifyPortableMissionDependenciesDescription, 'function');
  const state = await portableHost(t);
  const configuration = {
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    maximumReviewMaterializedBytes: 65_536,
    maximumRevisionMaterializedBytes: 32_768,
    executorIdPrefix: 'portable-dependencies-test',
  };
  const bundle = await subject.createPortableMissionDependencies(configuration);
  const description = bundle.describe();

  assert.deepEqual(Object.keys(bundle).sort(), [
    'describe', 'nativeTransport', 'reviewExecutor', 'revisionExecutor',
  ]);
  assert.deepEqual(Object.keys(description), [
    'schemaVersion', 'protocolId', 'portableHost', 'godskills', 'dependencies',
    'limits', 'bindingDigest',
  ]);
  assert.equal(description.schemaVersion, 1);
  assert.equal(description.protocolId, 'eternities-portable-mission-dependencies-v1');
  assert.deepEqual(description.portableHost, state.host.describe());
  assert.deepEqual(description.dependencies.nativeTransport, await bundle.nativeTransport.descriptor());
  assert.deepEqual(description.dependencies.reviewExecutor, await bundle.reviewExecutor.descriptor());
  assert.deepEqual(description.dependencies.revisionExecutor, await bundle.revisionExecutor.descriptor());
  assert.equal(description.limits.maximumReviewMaterializedBytes, 65_536);
  assert.equal(description.limits.maximumRevisionMaterializedBytes, 32_768);
  assert.equal(canonicalJson(description).includes(state.secret), false);
  assert.equal(state.providerCalls, 0);
  assert.equal(Object.isFrozen(description), true);
  assert.equal(Object.isFrozen(description.dependencies), true);
  assert.deepEqual(subject.verifyPortableMissionDependenciesDescription(description), description);
  assert.notEqual(bundle.describe(), description);
});

test('portable dependency descriptions are deterministic and reject coherent substitution', async (t) => {
  const subject = await loadSubject();
  const state = await portableHost(t);
  const configuration = {
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    executorIdPrefix: 'portable-dependencies-parity',
  };
  const first = await subject.createPortableMissionDependencies(configuration);
  const second = await subject.createPortableMissionDependencies(configuration);
  assert.deepEqual(first.describe(), second.describe());

  const changed = structuredClone(first.describe());
  changed.dependencies.reviewTransportDescriptorDigest =
    changed.portableHost.descriptors.revision.descriptorDigest;
  const { bindingDigest: ignored, ...unsigned } = changed;
  changed.bindingDigest = sha256Value(unsigned);
  assert.throws(
    () => subject.verifyPortableMissionDependenciesDescription(changed),
    /portable|review.*transport.*descriptor/i,
  );
});

test('portable dependency construction fails closed for forged hosts and expanded configuration', async (t) => {
  const subject = await loadSubject();
  const state = await portableHost(t);
  const releasePin = pinnedGodskillsReviewRelease('C:/dev/eternities-godskills');
  await assert.rejects(
    subject.createPortableMissionDependencies({ host: state.host, releasePin, authority: ['realm:write'] }),
    /configuration/i,
  );
  await assert.rejects(
    subject.createPortableMissionDependencies({
      host: Object.freeze({ ...state.host, launch: async () => {} }),
      releasePin,
    }),
    /SDK-issued|host.*fields/i,
  );
  await assert.rejects(
    subject.createPortableMissionDependencies({ host: state.host, releasePin, artifactCache: {} }),
    /policy/i,
  );
  await assert.rejects(
    subject.createPortableMissionDependencies({ host: state.host, releasePin, io: { writeFile: async () => {} } }),
    /filesystem.*fields|io.*fields/i,
  );
  assert.equal(state.providerCalls, 0);
});
