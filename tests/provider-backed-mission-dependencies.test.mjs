import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';

const FAMILIES = Object.freeze({
  'openai-compatible-chat-completions-v1': Object.freeze({
    policy: validOpenAICompatiblePhasePolicy,
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
  }),
  'anthropic-messages-v1': Object.freeze({
    policy: validAnthropicMessagesPhasePolicy,
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
  }),
});

async function loadSubject() {
  try {
    return await import('../src/host/provider-backed-mission-dependencies.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

async function providerHost(t, family = 'openai-compatible-chat-completions-v1') {
  const root = await mkdtemp(join(tmpdir(), 'godagents-provider-backed-dependencies-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const definition = FAMILIES[family];
  const policy = definition.policy();
  const policyPath = join(root, 'policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const secret = 'provider-backed-dependencies-secret-canary';
  let providerCalls = 0;
  const env = {
    [definition.pin]: policyDigest,
    [policy.provider.credentialEnv]: secret,
  };
  const host = await createProviderPhaseHost({
    family,
    policyPath,
    runtimeRoot: join(root, 'provider-operations'),
    env,
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error('construction must not call the provider');
    },
  });
  return {
    host, policyDigest, secret, env, credentialEnv: policy.provider.credentialEnv,
    get providerCalls() { return providerCalls; },
  };
}

test('one certified provider host becomes one frozen policy-ready mission dependency bundle', async (t) => {
  const subject = await loadSubject();
  assert.equal(typeof subject.createProviderBackedMissionDependencies, 'function');
  const state = await providerHost(t);
  const bundle = await subject.createProviderBackedMissionDependencies({
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    maximumReviewMaterializedBytes: 65_536,
    maximumRevisionMaterializedBytes: 32_768,
    executorIdPrefix: 'provider-backed-test',
  });
  const description = bundle.describe();

  assert.deepEqual(Object.keys(bundle).sort(), [
    'describe', 'nativeTransport', 'reviewExecutor', 'revisionExecutor',
  ]);
  assert.deepEqual(Object.keys(description), [
    'schemaVersion', 'protocolId', 'provider', 'godskills', 'dependencies',
    'limits', 'bindingDigest',
  ]);
  assert.equal(description.schemaVersion, 1);
  assert.equal(description.protocolId, 'eternities-provider-backed-mission-dependencies-v1');
  assert.equal(description.provider.family, 'openai-compatible-chat-completions-v1');
  assert.equal(description.provider.policyDigest, state.policyDigest);
  assert.equal(description.provider.descriptionDigest, state.host.describe().descriptionDigest);
  assert.equal(description.godskills.releaseDigest, bundle.reviewExecutor.releaseDigest);
  assert.deepEqual(description.dependencies.nativeTransport, await bundle.nativeTransport.descriptor());
  assert.deepEqual(description.dependencies.reviewExecutor, await bundle.reviewExecutor.descriptor());
  assert.deepEqual(description.dependencies.revisionExecutor, await bundle.revisionExecutor.descriptor());
  assert.equal(description.limits.maximumReviewMaterializedBytes, 65_536);
  assert.equal(description.limits.maximumRevisionMaterializedBytes, 32_768);
  assert.equal(state.providerCalls, 0);
  assert.equal(canonicalJson(description).includes(state.secret), false);
  assert.equal(Object.isFrozen(description), true);
  assert.equal(Object.isFrozen(description.dependencies), true);
  assert.throws(() => { description.provider.family = 'changed'; }, TypeError);
  assert.deepEqual(bundle.describe(), description);
  assert.notEqual(bundle.describe(), description);
});

test('live transport descriptors must equal the exact certified host description', async (t) => {
  const subject = await loadSubject();
  const openai = await providerHost(t, 'openai-compatible-chat-completions-v1');
  const anthropic = await providerHost(t, 'anthropic-messages-v1');
  const substituted = Object.freeze({
    ...openai.host,
    review: anthropic.host.review,
  });

  await assert.rejects(
    subject.createProviderBackedMissionDependencies({
      host: substituted,
      releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    }),
    /SDK-issued|descriptor.*description|description.*descriptor/i,
  );
  assert.equal(openai.providerCalls, 0);
  assert.equal(anthropic.providerCalls, 0);
});

test('bundle verification rejects a coherently rehashed cross-phase dependency substitution', async (t) => {
  const subject = await loadSubject();
  assert.equal(typeof subject.verifyProviderBackedMissionDependenciesDescription, 'function');
  const state = await providerHost(t);
  const bundle = await subject.createProviderBackedMissionDependencies({
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
  });
  const description = bundle.describe();
  assert.deepEqual(
    subject.verifyProviderBackedMissionDependenciesDescription(description),
    description,
  );
  assert.deepEqual(description.provider.descriptors.native, await bundle.nativeTransport.descriptor());

  const changed = structuredClone(description);
  changed.dependencies.reviewTransportDescriptorDigest = changed.provider.descriptors.revision.descriptorDigest;
  const { bindingDigest, ...unsigned } = changed;
  changed.bindingDigest = sha256Value(unsigned);
  assert.throws(
    () => subject.verifyProviderBackedMissionDependenciesDescription(changed),
    /review.*transport.*descriptor/i,
  );
});

test('dependency construction remains credential-lazy and performs no provider preflight', async (t) => {
  const subject = await loadSubject();
  const state = await providerHost(t);
  delete state.env[state.credentialEnv];

  const bundle = await subject.createProviderBackedMissionDependencies({
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
  });
  assert.equal(bundle.describe().provider.policyDigest, state.policyDigest);
  assert.equal(state.providerCalls, 0);
});

test('both certified provider families reconstruct the same closed dependency surface deterministically', async (t) => {
  const subject = await loadSubject();
  for (const family of Object.keys(FAMILIES)) {
    const state = await providerHost(t, family);
    const options = {
      host: state.host,
      releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
      executorIdPrefix: 'provider-backed-family-parity',
    };
    const first = await subject.createProviderBackedMissionDependencies(options);
    const second = await subject.createProviderBackedMissionDependencies(options);
    assert.deepEqual(first.describe(), second.describe());
    assert.equal(first.describe().provider.family, family);
    assert.equal(first.describe().provider.policyDigest, state.policyDigest);
    assert.equal(state.providerCalls, 0);
  }
});

test('configuration, host surface, cache, and authority-shaped additions fail closed', async (t) => {
  const subject = await loadSubject();
  const state = await providerHost(t);
  const releasePin = pinnedGodskillsReviewRelease('C:/dev/eternities-godskills');
  await assert.rejects(
    subject.createProviderBackedMissionDependencies({
      host: state.host,
      releasePin,
      authority: ['realm:write'],
    }),
    /configuration/i,
  );
  await assert.rejects(
    subject.createProviderBackedMissionDependencies({
      host: Object.freeze({ ...state.host, launch: async () => {} }),
      releasePin,
    }),
    /SDK-issued|host.*fields/i,
  );
  await assert.rejects(
    subject.createProviderBackedMissionDependencies({
      host: state.host,
      releasePin,
      artifactCache: {},
    }),
    /policy/i,
  );
  await assert.rejects(
    subject.createProviderBackedMissionDependencies({
      host: state.host,
      releasePin,
      io: { writeFile: async () => {} },
    }),
    /filesystem.*fields|io.*fields/i,
  );
  assert.equal(state.providerCalls, 0);
});

test('descriptor-equivalent forged callables cannot impersonate an SDK-issued provider host', async (t) => {
  const subject = await loadSubject();
  const state = await providerHost(t);
  const forged = Object.freeze({
    ...state.host,
    native: Object.freeze({
      ...state.host.native,
      async execute() { throw new Error('forged provider execution'); },
    }),
  });

  await assert.rejects(
    subject.createProviderBackedMissionDependencies({
      host: forged,
      releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    }),
    /SDK-issued|certified.*host|host.*instance/i,
  );
});

test('proxy and getter façades cannot enter the SDK-owned provider host trust boundary', async (t) => {
  const subject = await loadSubject();
  const state = await providerHost(t);
  const proxied = new Proxy(state.host, {
    get(target, property, receiver) {
      return Reflect.get(target, property, receiver);
    },
  });
  const getterFacade = {};
  for (const key of Object.keys(state.host)) {
    Object.defineProperty(getterFacade, key, {
      enumerable: true,
      get() { return state.host[key]; },
    });
  }
  Object.freeze(getterFacade);

  for (const host of [proxied, getterFacade]) {
    await assert.rejects(
      subject.createProviderBackedMissionDependencies({
        host,
        releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
      }),
      /SDK-issued|certified.*host|host.*instance/i,
    );
  }
});
