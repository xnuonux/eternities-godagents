import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { loadGrokCliPhasePolicy } from '../src/transports/grok-cli-phase-policy.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'grok-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = {
    schemaVersion: 1, protocolId: 'eternities-grok-cli-phase-transport-policy-v1', policyId: 'grok-subscription-test',
    provider: { transportKind: 'subprocess-json-v1', modelId: 'grok-4.6', reasoningEffort: 'low',
      usageProfile: 'grok-headless-additive-v1', timeoutMs: 90000, maximumRequestBytes: 262144, maximumResponseBytes: 131072,
      binary: { path: join(root, 'grok.exe'), sha256: 'a'.repeat(64) },
      bridge: { path: join(root, 'bridge.cjs'), sha256: 'b'.repeat(64) }, authFile: join(root, 'auth.json') },
    phases: { native: { maximumDispatchBytes: 131072, maximumCompletionBytes: 65536, maximumCompletionTokens: 16000 },
      review: { maximumCompletionBytes: 65536, maximumCompletionTokens: 16000 },
      revision: { maximumCompletionBytes: 65536, maximumCompletionTokens: 16000 } },
  };
  const path = join(root, 'policy.json');
  async function load(value = policy, text = `${canonicalJson(value)}\n`, pin = sha256Value(value)) {
    await writeFile(path, text);
    return loadGrokCliPhasePolicy({ path, env: { GODAGENT_GROK_PHASE_POLICY_SHA256: pin } });
  }
  return { root, path, policy, load };
}

test('canonical subscription policy is externally pinned and immutable without opening credentials or binary', async t => {
  const f = await fixture(t);
  const loaded = await f.load();
  assert.equal(loaded.digest, sha256Value(f.policy));
  assert.deepEqual(loaded.policy, f.policy);
  assert.equal(Object.isFrozen(loaded.policy.provider.binary), true);
  await assert.rejects(f.load(f.policy, `${canonicalJson(f.policy)}\n`, '0'.repeat(64)), { code: 'policy-integrity' });
  await assert.rejects(loadGrokCliPhasePolicy({ path: f.path, env: {} }), { code: 'policy-integrity' });
});

test('noncanonical, oversized, missing and relative policy paths fail closed', async t => {
  const f = await fixture(t);
  await assert.rejects(f.load(f.policy, JSON.stringify(f.policy, null, 2)), { code: 'policy-integrity' });
  await assert.rejects(f.load(f.policy, ' '.repeat(65537)), { code: 'policy-integrity' });
  await assert.rejects(loadGrokCliPhasePolicy({ path: join(f.root, 'missing.json') }), { code: 'policy-integrity' });
  await assert.rejects(loadGrokCliPhasePolicy({ path: 'policy.json' }), { code: 'policy-integrity' });
});

test('policy rejects paid routes, unpinned programs, unsupported semantics and excessive budgets', async t => {
  const f = await fixture(t);
  const mutations = [
    p => { p.provider.modelId = 'other'; }, p => { p.provider.endpointOrigin = 'https://api.x.ai'; },
    p => { p.provider.credential = 'secret'; }, p => { p.provider.transportKind = 'http'; },
    p => { p.provider.binary.sha256 = ''; }, p => { p.provider.bridge.path = 'relative.cjs'; },
    p => { p.provider.authFile += '\n'; }, p => { p.provider.usageProfile = 'guess'; },
    p => { p.provider.timeoutMs = 600001; }, p => { p.provider.maximumResponseBytes = 2097153; },
    p => { p.provider.maximumRequestBytes = 0; }, p => { p.provider.reasoningEffort = 'guess'; },
    p => { p.phases.native.maximumCompletionTokens = 32001; },
    p => { p.phases.review.maximumCompletionBytes = 0; }, p => { delete p.phases.revision; },
    p => { p.phases.native.maximumDispatchBytes = 1; }, p => { p.schemaVersion = 2; },
  ];
  for (const mutate of mutations) {
    const p = structuredClone(f.policy); mutate(p);
    await assert.rejects(f.load(p), { code: 'policy-invalid' });
  }
});
