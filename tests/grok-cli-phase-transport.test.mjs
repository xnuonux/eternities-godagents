import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, unlink, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grokProcessFixture } from './helpers/grok-cli-process-fixture.mjs';
import { nativeDispatch, reviewDispatch, revisionDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { createGrokCliPhaseTransportSuite, createGrokCliPortablePhaseHost } from '../src/transports/grok-cli-phase-transport.mjs';

const at='2026-08-31T20:01:00.000Z';
const config=f=>({policyPath:f.policyPath,env:f.env,runtimeRoot:join(f.root,'operations'),clock:()=>at});

test('all three real phase ports produce bound artifacts and replay without another child or auth file',async t=>{
  const f=await grokProcessFixture(t);
  const suite=await createGrokCliPhaseTransportSuite(config(f));
  const dispatches={native:await nativeDispatch(t,suite.descriptors.native),review:await reviewDispatch(suite.descriptors.review),revision:revisionDispatch(suite.descriptors.revision)};
  const results={};
  for(const phase of ['native','review','revision']) {
    results[phase]=await suite[phase].execute(dispatches[phase]);
    assert.equal(results[phase].completion.artifact.artifactType,phase);
    assert.equal(results[phase].completion.usage.inputTokens,120);
    const receipt=JSON.parse(await readFile(join(f.root,'operations',phase,dispatches[phase].dispatchDigest,'provider-evidence.json')));
    assert.equal(receipt.providerUsage.modelAttribution,'per-model-ledger-only');
    assert.equal(receipt.completionDigest,results[phase].completion.completionDigest);
    assert.equal(JSON.stringify(receipt).includes('fixture-access-secret'),false);
  }
  assert.equal(await f.calls(),3);
  await unlink(f.authPath);
  const restarted=await createGrokCliPhaseTransportSuite(config(f));
  for(const phase of ['native','review','revision']) {
    assert.deepEqual(await restarted[phase].reconcile(dispatches[phase]),results[phase]);
    assert.deepEqual(await restarted[phase].execute(dispatches[phase]),results[phase]);
  }
  assert.equal(await f.calls(),3);
  const host=await createGrokCliPortablePhaseHost(config(f));
  assert.equal(host.describe().capabilities.localDispatchSemantics,'at-most-once');
  assert.equal(host.describe().authority.realmEffects,false);
  assert.equal(host.describe().authority.soul,false);
  assert.deepEqual(host.assertCredentialAbsent({mission:'safe replay'}),{mission:'safe replay'});
  assert.deepEqual(await host.native.execute(dispatches.native),results.native);
  assert.equal(await f.calls(),3);
});
test('uncertain Grok subprocess remains pending across restart and never silently retries',async t=>{
  const f=await grokProcessFixture(t,'uncertain');
  const suite=await createGrokCliPhaseTransportSuite(config(f));
  const dispatch=await nativeDispatch(t,suite.descriptors.native);
  await assert.rejects(suite.native.execute(dispatch),{code:'provider-ambiguous'});
  const restarted=await createGrokCliPhaseTransportSuite(config(f));
  assert.deepEqual(await restarted.native.reconcile(dispatch),{status:'pending'});
  await assert.rejects(restarted.native.execute(dispatch),{code:'operation-pending'});
  assert.equal(await f.calls(),1);
});
test('reflected credentials become terminal sanitized failures without publication or retry',async t=>{
  const f=await grokProcessFixture(t,'secret');
  const suite=await createGrokCliPhaseTransportSuite(config(f));
  const dispatch=await nativeDispatch(t,suite.descriptors.native);
  await assert.rejects(suite.native.execute(dispatch),{code:'credential-reflected'});
  await assert.rejects(suite.native.execute(dispatch),{code:'credential-reflected'});
  const slot=join(f.root,'operations','native',dispatch.dispatchDigest);
  const failure=await readFile(join(slot,'failure.json'),'utf8');
  assert.equal(failure.includes(f.auth.account.key),false);
  assert.equal(JSON.parse(failure).httpStatus,null);
  await assert.rejects(readFile(join(slot,'provider-evidence.json')),{code:'ENOENT'});
  assert.equal(await f.calls(),1);
});
test('a rejected real-child response leaves bound safe diagnostic facts and terminal replay',async t=>{
  const f=await grokProcessFixture(t,'missing-ledger');
  const suite=await createGrokCliPhaseTransportSuite(config(f));
  const dispatch=await nativeDispatch(t,suite.descriptors.native);
  await assert.rejects(suite.native.execute(dispatch),{code:'response-invalid'});
  const slot=join(f.root,'operations','native',dispatch.dispatchDigest);
  const diagnostic=JSON.parse(await readFile(join(f.root,'operations','grok-rejection-diagnostics-v1',`native-${dispatch.dispatchDigest}.json`),'utf8'));
  const failure=JSON.parse(await readFile(join(slot,'failure.json'),'utf8'));
  assert.equal(diagnostic.stage,'usage-accounting');
  assert.equal(diagnostic.responseDigest,failure.responseDigest);
  assert.equal(diagnostic.requestDigest,failure.requestDigest);
  assert.equal(diagnostic.policyDigest,suite.policyDigest);
  assert.equal(diagnostic.observed.fields.modelUsage.type,'missing');
  assert.equal(diagnostic.observed.usage.input_tokens.value,100);
  assert.equal(JSON.stringify(diagnostic).includes('synthetic native'),false);
  await assert.rejects(suite.native.execute(dispatch),{code:'response-invalid'});
  assert.equal(await f.calls(),1);
});
test('diagnostic conflicts cannot overwrite evidence, mask rejection, or cause another provider call',async t=>{
  const f=await grokProcessFixture(t,'missing-ledger');
  const diagnosticRoot=join(f.root,'operations','grok-rejection-diagnostics-v1');
  let target;
  const suite=await createGrokCliPhaseTransportSuite({...config(f),checkpoint:async(name,phase,digest)=>{
    if(name==='after-grok-cli-phase-attempt-persisted') {
      await mkdir(diagnosticRoot);
      target=join(diagnosticRoot,`${phase}-${digest}.json`);
      await writeFile(target,'preexisting conflicting evidence');
    }
  }});
  const dispatch=await nativeDispatch(t,suite.descriptors.native);
  await assert.rejects(suite.native.execute(dispatch),{code:'response-invalid'});
  assert.equal(await readFile(target,'utf8'),'preexisting conflicting evidence');
  await assert.rejects(suite.native.execute(dispatch),{code:'response-invalid'});
  assert.equal(await f.calls(),1);
});
