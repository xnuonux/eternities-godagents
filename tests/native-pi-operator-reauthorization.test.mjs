import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { acquireCortexBinding } from '../src/host/cortex-binding-registry.mjs';
import { loadPiSdk } from '../src/host/pi-native-session.mjs';
import { runNativeOperator, prepareNativeOperator } from '../src/host/native-pi-operator.mjs';
import { validateNativeOperatorConfig, validateNativePreparationRequest }
  from '../src/host/native-pi-operator-config.mjs';

const packageRoot = process.env.GODAGENTS_PI_PACKAGE_ROOT;
const nativeTest = (name, fn) => test(name,
  { skip: !packageRoot && 'qualified optional Pi SDK required' }, fn);

nativeTest('pinned epoch permits a new session, never resets the revoked binding or replays its work', async t => {
  const f = await nativeAdmission(t);
  const admissionRoot = dirname(f.options.admission.transactionDir);
  const registryRoot = join(admissionRoot, 'native-bindings');
  const instanceRegistryRoot = join(admissionRoot, 'native-instances');
  const old = await acquireCortexBinding({ admission: f.options.admission,
    request: f.options.request, registryRoot, instanceRegistryRoot, leaseDurationMs: 60000 });
  f.dispose(() => old.release());
  const revoked = await old.revoke({ reasonDigest: sha256Value({ reason: 'controlled fixture revocation' }) });
  assert.equal(revoked.revocationEpoch, 1);
  const registryPath = join(registryRoot, 'registry.json');
  const originalEvents = JSON.parse(await readFile(registryPath, 'utf8')).events;
  const evidencePath = join(f.root, 'original-uncertain-action.txt');
  await writeFile(evidencePath, 'fixture evidence: unresolved; do not replay');

  const runtime = await loadPiSdk(packageRoot);
  const authPath = join(f.root, 'test-auth.json');
  const modelRuntime = await runtime.sdk.ModelRuntime.create({ authPath, modelsPath: null,
    allowModelNetwork: false, refreshOnCreate: false });
  let inferences = 0;
  modelRuntime.registerProvider('fixture', {
    api: 'openai-completions', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixture-only',
    models: [{ id: 'native-model', name: 'reauthorization fixture', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8000 }],
    streamSimple(model) {
      inferences += 1;
      const stream = runtime.ai.createAssistantMessageEventStream();
      const message = { role: 'assistant', content: [{ type: 'text', text: 'Fresh task only.' }],
        api: model.api, provider: model.provider, model: model.id,
        usage: { input: 3, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 5,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: Date.now() };
      stream.push({ type: 'done', reason: 'stop', message }); stream.end(message); return stream;
    },
  });
  // Only authentication/provider output are scripted; Pi sessions and binding registry are real.
  modelRuntime.checkAuth = async () => ({ type: 'oauth' });
  modelRuntime.isUsingSubscription = () => true;
  const { keelAdapter, ...admission } = f.options.admission;
  const base = { schemaVersion: 1, protocolId: 'eternities-native-pi-operator-v1',
    piPackageRoot: packageRoot, authPath, cwd: f.cwd, sessionRoot: join(f.root, 'stale'),
    admission: { ...admission, keelRoot: join(admissionRoot, 'keels') },
    mission: f.options.request.mission, model: { provider: 'fixture', id: 'native-model', maxTokens: 8000 },
    grant: { allowedTools: ['read'], maxToolCalls: 10, expiresAt: new Date(Date.now() + 3600000).toISOString() },
    limits: { maxRunMs: 60000 } };
  const run = (config, command = 'launch', extra = {}) => runNativeOperator({ config,
    expectedConfigDigest: sha256Value(config), command, prompt: 'Perform this fresh read-only task.',
    runtime, modelRuntime, ...extra });

  for (const config of [base, { ...base, sessionRoot: join(f.root, 'future'), revocationEpoch: 2 }]) {
    const result = await run(config);
    assert.equal(result.status, 'failed');
    assert.equal(result.category, 'native-operator:revocation-epoch-mismatch');
    assert.equal(inferences, 0);
    assert.deepEqual(JSON.parse(await readFile(registryPath, 'utf8')).events, originalEvents);
  }
  const corrected = { ...base, revocationEpoch: 1, sessionRoot: join(f.root, 'reauthorized') };
  await assert.rejects(run(corrected, 'launch', { expectedConfigDigest: sha256Value(base) }), /config-pin/);
  await assert.rejects(access(corrected.sessionRoot), e => e.code === 'ENOENT');
  assert.equal(inferences, 0);
  assert.equal(validateNativeOperatorConfig(corrected), corrected);
  for (const revocationEpoch of [-1, 1.5, '1', null]) {
    assert.throws(() => validateNativeOperatorConfig({ ...corrected, revocationEpoch }), /revocation-epoch/);
  }

  const binding = JSON.parse(await readFile(join(admissionRoot, 'binding.json'), 'utf8'));
  const { admission: omitted, ...host } = corrected;
  const request = { ...host, protocolId: 'eternities-native-pi-preparation-v1',
    admissionRoot, expectedBindingDigest: binding.bindingDigest };
  assert.equal(validateNativePreparationRequest(request), request);
  const configPath = join(f.root, 'reauthorized-config.json');
  const prepared = await prepareNativeOperator({ request, expectedRequestDigest: sha256Value(request), outputPath: configPath });
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(config.revocationEpoch, 1);
  assert.equal(prepared.configDigest, sha256Value(config));
  assert.equal(inferences, 0);
  assert.deepEqual(JSON.parse(await readFile(registryPath, 'utf8')).events, originalEvents);
  const first = await run(config);
  assert.equal(first.status, 'native-turn-settled');
  assert.equal(inferences, 1);
  const metadata = JSON.parse(await readFile(join(config.sessionRoot, 'operator.json'), 'utf8'));
  assert.equal(metadata.request.task.revocationEpoch, 1);
  assert.equal(metadata.grant.instanceId, f.options.admission.instanceId);
  assert.notEqual(metadata.sessionId, f.options.request.task.taskId);
  await assert.rejects(run({ ...config, revocationEpoch: 2 }, 'resume'), /config-mismatch/);
  assert.equal(inferences, 1);
  const second = await run(config, 'resume');
  assert.equal(second.status, 'native-turn-settled');
  assert.equal(second.state.associationDigest, first.state.associationDigest);
  assert.equal(inferences, 2);
  const events = JSON.parse(await readFile(registryPath, 'utf8')).events;
  assert.deepEqual(events.slice(0, originalEvents.length), originalEvents);
  assert.equal(await readFile(evidencePath, 'utf8'), 'fixture evidence: unresolved; do not replay');
});
