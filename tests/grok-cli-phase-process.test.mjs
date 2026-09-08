import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { grokProcessFixture } from './helpers/grok-cli-process-fixture.mjs';
import { createGrokCliPhaseProcess } from '../src/transports/grok-cli-phase-process.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { createRequire } from 'node:module';

function request() {
  const body = canonicalJson({ model:'grok-4.6',maxCompletionTokens:400,reasoningEffort:'low',
    messages:[{role:'system',content:'Return JSON'},{role:'user',content:canonicalJson({phase:'native'})}] });
  return {body,bodyBytes:Buffer.byteLength(body),requestDigest:sha256Text(body)};
}
test('pinned bridge creates restricted disposable invocation and raw process result with opaque credentials', async t => {
  const f=await grokProcessFixture(t);
  const runner=createGrokCliPhaseProcess({policy:f.policy});
  const credential=runner.credentialResolver.resolve();
  assert.equal(JSON.stringify(credential),'{}');
  assert.equal(runner.process.assertCredentialAbsent({text:'safe',credential}),true);
  assert.equal(runner.process.assertCredentialAbsent({text:f.auth.account.key,credential}),false);
  const escaped=JSON.stringify({text:JSON.stringify({content:f.auth.account.key})}).replace('fixture','\\u0066ixture');
  assert.equal(runner.process.assertCredentialAbsent({text:escaped,credential}),false);
  assert.equal(runner.process.assertCredentialAbsent({text:'safe',credential:{}}),false);
  const result=await runner.process.invoke({policy:f.policy,credential,request:request()});
  assert.equal(result.kind,'subprocess-json-v1');
  assert.equal(result.exitCode,0);
  assert.equal(JSON.parse(JSON.parse(result.bodyText).text).content,'synthetic native');
  assert.equal(await f.calls(),1);
  const lastRoot=await readFile(join(f.root,'last-root.txt'),'utf8');
  await assert.rejects(access(lastRoot),{code:'ENOENT'});
});
test('API keys, stale or missing auth, and mismatched program pins fail before process work', async t => {
  for(const mode of ['api','expired','missing','pin']) {
    const f=await grokProcessFixture(t);
    if(mode==='api') { f.auth.account.auth_mode='api_key'; await writeFile(f.authPath,JSON.stringify(f.auth)); }
    if(mode==='expired') { f.auth.account.expires_at='2020-01-01T00:00:00.000Z'; await writeFile(f.authPath,JSON.stringify(f.auth)); }
    if(mode==='missing') await unlink(f.authPath);
    if(mode==='pin') f.policy.provider.bridge.sha256='0'.repeat(64);
    const runner=createGrokCliPhaseProcess({policy:f.policy});
    await assert.rejects(async()=>{
      const credential=runner.credentialResolver.resolve();
      await runner.process.invoke({policy:f.policy,credential,request:request()});
    });
    assert.equal(await f.calls(),0);
  }
});
test('changed credential copy and hidden session continuation fail closed and clean temporary auth', async t => {
  for(const mode of ['rotate','resume']) {
    const f=await grokProcessFixture(t,mode);
    const runner=createGrokCliPhaseProcess({policy:f.policy});
    await assert.rejects(runner.process.invoke({policy:f.policy,credential:runner.credentialResolver.resolve(),request:request()}));
    assert.equal(await f.calls(),0);
    await assert.rejects(access(await readFile(join(f.root,'last-root.txt'),'utf8')),{code:'ENOENT'});
  }
});
test('request digest tampering and credentials cannot reach the native bridge', async t => {
  const f=await grokProcessFixture(t);
  const runner=createGrokCliPhaseProcess({policy:f.policy});
  const credential=runner.credentialResolver.resolve();
  const changed=request(); changed.body+=' ';
  await assert.rejects(runner.process.invoke({policy:f.policy,credential,request:changed}));
  const secret=request(); secret.body=secret.body.replace('Return JSON',f.auth.account.key);
  secret.bodyBytes=Buffer.byteLength(secret.body); secret.requestDigest=sha256Text(secret.body);
  await assert.rejects(runner.process.invoke({policy:f.policy,credential,request:secret}));
  assert.equal(await f.calls(),0);
});
test('uncertain process failure never retries and removes its disposable home', async t => {
  const f=await grokProcessFixture(t,'uncertain');
  const runner=createGrokCliPhaseProcess({policy:f.policy});
  await assert.rejects(runner.process.invoke({policy:f.policy,credential:runner.credentialResolver.resolve(),request:request()}));
  assert.equal(await f.calls(),1);
  await assert.rejects(access(await readFile(join(f.root,'last-root.txt'),'utf8')),{code:'ENOENT'});
});
test('real nonzero exit, timeout and contradictory returned status cannot become completed witnesses',async t=>{
  for(const mode of ['nonzero','timeout','returned-nonzero']) {
    const f=await grokProcessFixture(t,mode);
    const runner=createGrokCliPhaseProcess({policy:f.policy});
    await assert.rejects(runner.process.invoke({policy:f.policy,credential:runner.credentialResolver.resolve(),request:request()}));
    assert.equal(await f.calls(),1);
    await assert.rejects(access(await readFile(join(f.root,'last-root.txt'),'utf8')),{code:'ENOENT'});
  }
});
test('unverified preloaded bridge cache is not accepted as proof of pinned source',async t=>{
  const f=await grokProcessFixture(t);
  createRequire(import.meta.url)(f.policy.provider.bridge.path);
  const runner=createGrokCliPhaseProcess({policy:f.policy});
  await assert.rejects(runner.process.invoke({policy:f.policy,credential:runner.credentialResolver.resolve(),request:request()}));
  assert.equal(await f.calls(),0);
});
test('non-data or symbol-expanded bridge results reject without reading provider getters',async t=>{
  for(const mode of ['accessor','symbol-status']) {
    const f=await grokProcessFixture(t,mode);
    const runner=createGrokCliPhaseProcess({policy:f.policy});
    await assert.rejects(runner.process.invoke({policy:f.policy,credential:runner.credentialResolver.resolve(),request:request()}));
    await assert.rejects(access(join(f.root,'getter-read.txt')),{code:'ENOENT'});
  }
});
