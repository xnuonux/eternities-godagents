import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { loadPiSdk } from '../src/host/pi-native-session.mjs';
import { runNativeOperator } from '../src/host/native-pi-operator.mjs';

const packageRoot = process.env.GODAGENTS_PI_PACKAGE_ROOT;
const nativeTest = (name, fn) => test(name, { skip: !packageRoot && 'qualified optional Pi SDK required' }, fn);
const done = [{ type: 'text', text: 'private assistant handoff' }];
const write = (id, path, content) => [{ type: 'toolCall', id, name: 'write', arguments: { path, content } }];
const usage = (output, reasoning) => ({
  input: 3, output, cacheRead: 1, cacheWrite: 0, totalTokens: 3 + output + 1,
  ...(reasoning === undefined ? {} : { reasoning }),
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

async function setup(t, responses) {
  const f = await nativeAdmission(t), runtime = await loadPiSdk(packageRoot);
  const modelRuntime = await runtime.sdk.ModelRuntime.create({
    authPath: join(f.root, 'test-auth.json'), modelsPath: null,
    allowModelNetwork: false, refreshOnCreate: false,
  });
  const contexts = [];
  modelRuntime.registerProvider('fixture', {
    api: 'openai-completions', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixture-only',
    models: [{
      id: 'native-model', name: 'operator fixture', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8000,
    }],
    streamSimple(model, context) {
      contexts.push(JSON.parse(JSON.stringify(context)));
      let content = responses.shift();
      assert.ok(content, 'unexpected inference');
      if (content instanceof Error) throw content;
      const errorMessage = Array.isArray(content) ? undefined : content.errorMessage;
      const reported = Array.isArray(content) ? undefined : content.usage;
      if (!Array.isArray(content)) content = content.content ?? [];
      const stream = runtime.ai.createAssistantMessageEventStream();
      const message = {
        role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
        usage: errorMessage
          ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
          : (reported ?? usage(2)),
        stopReason: errorMessage ? 'error' : content.some(x => x.type === 'toolCall') ? 'toolUse' : 'stop',
        ...(errorMessage ? { errorMessage } : {}), timestamp: Date.now(),
      };
      stream.push(errorMessage ? { type: 'error', reason: 'error', error: message } : { type: 'done', reason: message.stopReason, message });
      stream.end(message);
      return stream;
    },
  });
  modelRuntime.checkAuth = async () => ({ type: 'oauth' });
  modelRuntime.isUsingSubscription = () => true;
  const { keelAdapter, ...admission } = f.options.admission;
  const config = {
    schemaVersion: 1, protocolId: 'eternities-native-pi-operator-v1', piPackageRoot: packageRoot,
    authPath: join(f.root, 'test-auth.json'), cwd: f.cwd, sessionRoot: join(f.root, 'operator'),
    admission: { ...admission, keelRoot: join(dirname(admission.transactionDir), 'keels') },
    mission: f.options.request.mission, model: { provider: 'fixture', id: 'native-model', maxTokens: 8000 },
    grant: { allowedTools: ['read', 'write', 'edit'], maxToolCalls: 20, expiresAt: new Date(Date.now() + 3600000).toISOString() },
    limits: { maxRunMs: 60000 },
  };
  const run = (command, prompt, overrides = {}) => runNativeOperator({
    command, config, expectedConfigDigest: sha256Value(config), runtime, modelRuntime, prompt, ...overrides,
  });
  return { f, runtime, config, contexts, responses, run };
}

nativeTest('settled launch persists completionBreakdown beside usage for this invocation only', async t => {
  const x = await setup(t, [
    { content: write('op-first', 'first.txt', 'stage one'), usage: usage(10, 4) },
    { content: done, usage: usage(6, 2) },
  ]);
  const first = await x.run('launch', 'stage one');
  assert.equal(first.status, 'native-turn-settled');
  assert.equal(first.usage.outputTokens, 16);
  assert.deepEqual(first.completionBreakdown, {
    schemaVersion: 1, messageCount: 2, knownMessages: 2, unknownMessages: 0,
    reasoningTokens: 6, nonReasoningOutputTokens: 10,
  });
  assert.equal('completionBreakdown' in first.usage, false);
  const saved = JSON.parse(await readFile(join(first.runPath, 'result.json'), 'utf8'));
  assert.deepEqual(saved.completionBreakdown, first.completionBreakdown);
  assert.doesNotMatch(JSON.stringify(first), /private assistant handoff|fixture-only/);

  x.responses.push({ content: write('op-second', 'second.txt', 'stage two'), usage: usage(8, 1) }, { content: done, usage: usage(4, 1) });
  const second = await x.run('resume', 'stage two');
  assert.equal(second.status, 'native-turn-settled');
  assert.deepEqual(second.completionBreakdown, {
    schemaVersion: 1, messageCount: 2, knownMessages: 2, unknownMessages: 0,
    reasoningTokens: 2, nonReasoningOutputTokens: 10,
  });
  assert.equal((await readdir(join(x.config.sessionRoot, 'runs'))).length, 2);
});

nativeTest('failed runs still record completionBreakdown and setup failures omit it', async t => {
  const failedRun = await setup(t, [new Error('Bearer never-print-provider-secret')]);
  const result = await failedRun.run('launch', 'private mission input');
  assert.equal(result.status, 'failed');
  assert.ok(result.completionBreakdown);
  assert.equal(result.completionBreakdown.schemaVersion, 1);
  assert.equal(typeof result.completionBreakdown.messageCount, 'number');
  const saved = JSON.parse(await readFile(join(result.runPath, 'result.json'), 'utf8'));
  assert.deepEqual(saved.completionBreakdown, result.completionBreakdown);

  const x = await setup(t, []);
  const original = x.runtime.sdk.SessionManager.create;
  x.runtime.sdk.SessionManager.create = () => { throw new Error('private injected startup failure'); };
  let setupFailed;
  try { setupFailed = await x.run('launch', 'test'); }
  finally { x.runtime.sdk.SessionManager.create = original; }
  assert.equal(setupFailed.status, 'failed');
  assert.equal(setupFailed.category, 'native-operator:setup-failed');
  assert.equal('completionBreakdown' in setupFailed, false);
  assert.equal('usage' in setupFailed, false);
});
