import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
import { artifactProgramDefinition, controlledArtifactProgramProvider } from './helpers/artifact-program-fixture.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { grokProcessFixture } from './helpers/grok-cli-process-fixture.mjs';
import { runLocalWorkflowCli } from '../examples/local-artifact-workflow/cli.mjs';
import { compileArtifactProgram } from '../src/runtime/artifact-program-contracts.mjs';
const api = await import('../examples/local-artifact-workflow/program.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const json = v => `${canonicalJson(v)}\n`;
const prepOptions = f => ({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, definition: artifactProgramDefinition() });
const runOptions = (p, calls, controls = {}) => ({ programManifestPath: p.programManifestPath,
  expectedProgramManifestDigest: p.programManifestDigest, env: { GODAGENT_TEST_PHASE_KEY: 'controlled-program-secret' },
  createProviderPhaseHostImpl: controlledArtifactProgramProvider(calls, controls) });
const read = async p => JSON.parse(await readFile(p, 'utf8'));
const resolutionPath = (p, step) => join(dirname(p.programManifestPath), 'resolutions', `${sha256Value(step)}.json`);

test('artifact program prepares inertly, runs dependent missions with one identity, and replays exact results without inference', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [];
  const rootFiles = ['workflow.json', 'mission-request.json', 'identity-policy.json', 'provider-policy.json'];
  const originals = await Promise.all(rootFiles.map(name => readFile(join(f.workspace, name), 'utf8')));
  const p = await api.prepareArtifactProgram(prepOptions(f));
  assert.deepEqual(await api.prepareArtifactProgram(prepOptions(f)), p);
  const manifest = await read(p.programManifestPath);
  assert.equal(manifest.program.programInput.actor.instanceId, f.instanceId);
  assert.equal(await readFile(p.programManifestPath, 'utf8'), json(manifest));
  await assert.rejects(access(join(dirname(p.programManifestPath), 'resolutions')), { code: 'ENOENT' });
  const result = await api.runArtifactProgram(runOptions(p, calls));
  assert.equal(result.status, 'completed'); assert.equal(result.programId, p.programId);
  assert.equal(result.instanceId, f.instanceId); assert.equal(result.results.length, 2);
  assert.equal((await read(result.results[0].artifact.path)).content, 'ALPHA_7');
  assert.equal((await read(result.results[1].artifact.path)).content, 'ALPHA_7_BETA_9');
  assert.equal(result.usage.completionTokens, 40);
  assert.equal(result.resultBytes, result.results.reduce((n, s) => n + s.artifact.bytes, 0));
  assert.equal(calls.length, 2);
  const secondBody = canonicalJson(calls[1]);
  assert.ok(secondBody.includes('ALPHA_7')); assert.ok(secondBody.includes(result.results[0].artifact.artifactDigest));
  const firstResolution = await readFile(resolutionPath(p, 'first'), 'utf8');
  const secondResolution = await read(resolutionPath(p, 'second'));
  assert.equal(secondResolution.predecessors[0].missionReceiptDigest, result.results[0].missionReceiptDigest);
  assert.equal(secondResolution.predecessors[0].content, 'ALPHA_7');
  const replay = await api.runArtifactProgram({ ...runOptions(p, calls), env: {} });
  assert.equal(replay.status, 'completed'); assert.equal(replay.aggregateDigest, result.aggregateDigest);
  assert.deepEqual(replay.usage, result.usage);
  assert.equal(replay.results.every(step => step.artifact.replayed), true); assert.equal(calls.length, 2);
  assert.equal(await readFile(resolutionPath(p, 'first'), 'utf8'), firstResolution);
  assert.deepEqual(await Promise.all(rootFiles.map(name => readFile(join(f.workspace, name), 'utf8'))), originals);
});

test('artifact program refuses overcommit and counterfeit source pins before any execution', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [];
  const bad = prepOptions(f); bad.definition.budget.maxCompletionTokens = 799;
  await assert.rejects(api.prepareArtifactProgram(bad), /budget/);
  await assert.rejects(access(join(f.workspace, 'artifact-programs')), { code: 'ENOENT' });
  const p = await api.prepareArtifactProgram(prepOptions(f));
  const manifest = await read(p.programManifestPath);
  manifest.sourceDescriptor.publisherDigest = 'a'.repeat(64);
  await writeFile(p.programManifestPath, json(manifest));
  await assert.rejects(api.runArtifactProgram({ ...runOptions(p, calls), expectedProgramManifestDigest: sha256Text(json(manifest)) }), /descriptor|source/);
  assert.equal(calls.length, 0);
});

test('artifact program leaves uncertain second work pending, with no repeat first or second physical call', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [];
  const p = await api.prepareArtifactProgram(prepOptions(f));
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls, { uncertainAt: 2 })));
  assert.equal(calls.length, 2);
  const first = await readFile(resolutionPath(p, 'first'), 'utf8');
  const second = await readFile(resolutionPath(p, 'second'), 'utf8');
  const recovered = await api.runArtifactProgram({ ...runOptions(p, calls), env: {} });
  assert.equal(recovered.status, 'pending'); assert.equal(calls.length, 2);
  assert.equal(await readFile(resolutionPath(p, 'first'), 'utf8'), first);
  assert.equal(await readFile(resolutionPath(p, 'second'), 'utf8'), second);
});

test('completed artifact program revalidates published parents and required resolution evidence on every replay', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [];
  const p = await api.prepareArtifactProgram(prepOptions(f));
  const result = await api.runArtifactProgram(runOptions(p, calls));
  const parent = result.results[0].artifact.path;
  const original = await readFile(parent, 'utf8');
  await writeFile(parent, json({ schemaVersion: 1, artifactType: 'native', content: 'changed' }));
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls)));
  await writeFile(parent, original);
  const resolution = resolutionPath(p, 'first');
  await rename(resolution, `${resolution}.held`);
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls)), /resolution|evidence/);
  await rename(`${resolution}.held`, resolution);
  const forged = await read(resolution); forged.request.observation.summary = 'rehashed replacement';
  forged.requestDigest = sha256Value(forged.request);
  const { resolutionDigest, ...unsigned } = forged; forged.resolutionDigest = sha256Value(unsigned);
  await writeFile(resolution, json(forged));
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls)), /resolution|binding/);
  assert.equal(calls.length, 2);
});

test('artifact program detects manifest drift during inference before committing or starting a child', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [];
  const p = await api.prepareArtifactProgram(prepOptions(f));
  const original = await readFile(p.programManifestPath, 'utf8');
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls, { beforeResponse: async index => {
    if (index === 1) await writeFile(p.programManifestPath, '{}\n');
  } })), /source|manifest|program/);
  assert.equal(calls.length, 1);
  await writeFile(p.programManifestPath, original);
  const recovered = await api.runArtifactProgram(runOptions(p, calls));
  assert.equal(recovered.status, 'completed'); assert.equal(calls.length, 2);
  assert.equal((await read(recovered.results[0].artifact.path)).content, 'ALPHA_7');
});

test('artifact program refuses an aliased coordinator directory without writing through it', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [];
  const p = await api.prepareArtifactProgram(prepOptions(f));
  const target = join(f.workspace, 'owned-alias-target'); await mkdir(target);
  await symlink(target, join(dirname(p.programManifestPath), 'coordinator'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls)), /aliased|canonical/);
  assert.equal(calls.length, 0); assert.deepEqual(await readdir(target), []);
});

test('artifact program preserves a routing refusal as needs-decision without executing descendants', async t => {
  const f = await prepareArtifactRealmFixture(t, config => {
    config.request = structuredClone(config.request);
    config.request.requestedAuthority = ['realm:write']; config.request.hostCeiling.availableAuthority = ['realm:write'];
    config.hostPolicy.authority = ['realm:write']; config.hostPolicy.hostContext.availableAuthority = ['realm:write'];
    delete config.request.effectAssessment;
    config.request = prepareLocalArtifactEffectRequest(config.request,
      { expectedProducerDescriptorDigest: config.effectOnly.producerDescriptorDigest });
  });
  const calls = [], p = await api.prepareArtifactProgram(prepOptions(f));
  const refused = await api.runArtifactProgram(runOptions(p, calls));
  assert.equal(refused.status, 'needs-decision'); assert.equal(refused.stepId, 'first');
  assert.equal(refused.reason, 'route-needs-decision'); assert.equal(calls.length, 0);
  await assert.rejects(access(resolutionPath(p, 'second')), { code: 'ENOENT' });
});

test('artifact program concurrent invocation cannot acquire the live workspace owner or duplicate inference', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [];
  const p = await api.prepareArtifactProgram(prepOptions(f));
  let release, entered;
  const gate = new Promise(r => { release = r; }), atBoundary = new Promise(r => { entered = r; });
  t.after(() => release());
  const first = api.runArtifactProgram(runOptions(p, calls, { beforeResponse: async index => {
    if (index === 1) { entered(); await gate; }
  } }));
  await atBoundary;
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls)), /locked|lock/);
  assert.equal(calls.length, 1);
  release(); assert.equal((await first).status, 'completed'); assert.equal(calls.length, 2);
});

test('artifact program carries selected evidence through the controlled Anthropic host', async t => {
  const f = await prepareArtifactRealmFixture(t, async config => {
    config.family = 'anthropic-messages-v1';
    await writeFile(config.providerPolicyPath, json(validAnthropicMessagesPhasePolicy()));
  });
  const calls = [], p = await api.prepareArtifactProgram(prepOptions(f));
  const result = await api.runArtifactProgram({ ...runOptions(p, calls), env: { GODAGENT_TEST_ANTHROPIC_KEY: 'controlled-program-secret' } });
  assert.equal(result.status, 'completed'); assert.equal(calls.length, 2);
  assert.ok(canonicalJson(calls[1]).includes('ALPHA_7'));
  assert.equal(result.usage.completionTokens, 40);
  assert.equal((await api.runArtifactProgram({ ...runOptions(p, calls), env: {} })).status, 'completed');
  assert.equal(calls.length, 2);
});

test('artifact program Grok portable host uses two controlled processes then replays without credentials', async t => {
  const grok = await grokProcessFixture(t);
  const f = await prepareArtifactRealmFixture(t, config => {
    config.family = 'grok-cli-subscription-v1'; config.providerPolicyPath = grok.policyPath;
  });
  const p = await api.prepareArtifactProgram(prepOptions(f));
  const opts = { programManifestPath: p.programManifestPath, expectedProgramManifestDigest: p.programManifestDigest, env: grok.env };
  const result = await api.runArtifactProgram(opts);
  assert.equal(result.status, 'completed'); assert.equal(await grok.calls(), 2);
  const second = await read(resolutionPath(p, 'second'));
  assert.equal(second.predecessors[0].content, 'synthetic native');
  await rename(grok.authPath, `${grok.authPath}.saved`);
  const replay = await api.runArtifactProgram(opts);
  assert.equal(replay.status, 'completed'); assert.equal(replay.aggregateDigest, result.aggregateDigest);
  assert.equal(await grok.calls(), 2);
});

test('artifact program CLI prepares an inert pinned program and rejects malformed command shapes', async t => {
  const f = await prepareArtifactRealmFixture(t);
  const path = join(f.workspace, 'program-definition.json'); await writeFile(path, json(artifactProgramDefinition()));
  let output = '', errors = '';
  const call = argv => runLocalWorkflowCli({ argv, env: {}, stdout: { write: s => { output += s; } }, stderr: { write: s => { errors += s; } } });
  assert.equal(await call(['program-prepare', '--manifest', f.manifestPath, '--manifest-digest', f.manifestDigest, '--definition', path]), 0);
  assert.equal(errors, '');
  const p = JSON.parse(output);
  assert.equal((await read(p.programManifestPath)).program.programInput.programId, p.programId);
  await assert.rejects(access(join(dirname(p.programManifestPath), 'coordinator')), { code: 'ENOENT' });
  for (const argv of [
    ['program-run', '--program', p.programManifestPath],
    ['program-run', '--program', p.programManifestPath, '--program-digest', 'bad'],
    ['program-run', '--program', p.programManifestPath, '--program-digest', p.programManifestDigest, '--execute', 'yes'],
    ['program-prepare', '--manifest', f.manifestPath, '--manifest-digest', f.manifestDigest, '--manifest', f.manifestPath],
  ]) assert.equal(await call(argv), 2);
});

test('artifact program CLI replays a completed program with no HTTP transport and preserves command exit status', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [], p = await api.prepareArtifactProgram(prepOptions(f));
  await api.runArtifactProgram(runOptions(p, calls));
  let output = '', errors = '';
  const code = await runLocalWorkflowCli({ argv: ['program-run', '--program', p.programManifestPath, '--program-digest', p.programManifestDigest],
    env: {}, stdout: { write: s => { output += s; } }, stderr: { write: s => { errors += s; } } });
  assert.equal(code, 0); assert.equal(errors, ''); assert.equal(JSON.parse(output).status, 'completed');
  assert.equal(calls.length, 2);
});

test('artifact program external byte pin does not normalize away an added UTF-8 BOM', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [], p = await api.prepareArtifactProgram(prepOptions(f));
  const original = await readFile(p.programManifestPath, 'utf8');
  await writeFile(p.programManifestPath, `\ufeff${original}`, 'utf8');
  await assert.rejects(api.runArtifactProgram(runOptions(p, calls)));
  assert.equal(calls.length, 0);
});

test('artifact program rejects self-consistent forged actor, continuity and source bindings against the actual owner', async t => {
  const f = await prepareArtifactRealmFixture(t), calls = [], p = await api.prepareArtifactProgram(prepOptions(f));
  const original = await read(p.programManifestPath);
  const baseRequest = await read(join(f.workspace, 'mission-request.json'));
  const policy = await read(join(f.workspace, 'identity-policy.json'));
  for (const mutate of [
    source => { source.actor.identityDigest = 'a'.repeat(64); },
    source => { source.actor.genomeDigest = 'b'.repeat(64); },
    source => { source.actor.keelHeadDigest = 'c'.repeat(64); },
    source => { source.realmBindingDigest = 'd'.repeat(64); },
    source => { source.providerPolicyDigest = 'e'.repeat(64); },
    source => { source.genesisId = 'f'.repeat(64); },
  ]) {
    const forged = structuredClone(original), sourceBinding = structuredClone(original.program.sourceBinding);
    mutate(sourceBinding);
    forged.program = compileArtifactProgram({ definition: original.program.definition, sourceBinding, baseRequest, policy });
    await writeFile(p.programManifestPath, json(forged));
    await assert.rejects(api.runArtifactProgram({ ...runOptions(p, calls), expectedProgramManifestDigest: sha256Text(json(forged)) }), /binding/);
  }
  assert.equal(calls.length, 0);
});
