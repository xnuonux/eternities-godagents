import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value, sha256Text } from '../src/core/digest.mjs';
import { grokProcessFixture } from './helpers/grok-cli-process-fixture.mjs';
import { nativeDispatch, reviewDispatch, revisionDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { loadGrokCliPhasePolicy } from '../src/transports/grok-cli-phase-policy.mjs';
import { createGrokCliPhaseTransportSuite } from '../src/transports/grok-cli-phase-transport.mjs';
import { compileGrokCliPhaseRequest } from '../src/transports/grok-cli-phase-protocol.mjs';
import { createGrokCliPhaseProcess } from '../src/transports/grok-cli-phase-process.mjs';

const config=f=>({policyPath:f.policyPath,env:f.env,runtimeRoot:join(f.root,'operations')});
async function select(f,value='json-schema-v1') {
  f.policy.provider.structuredOutputProfile=value;
  await writeFile(f.policyPath,canonicalJson(f.policy)+'\n');
  f.env.GODAGENT_GROK_PHASE_POLICY_SHA256=sha256Value(f.policy);
}
test('structured output is an explicit policy migration and unknown or stale profiles reject',async t=>{
  const f=await grokProcessFixture(t),oldPin=f.env.GODAGENT_GROK_PHASE_POLICY_SHA256;
  await select(f);
  const loaded=await loadGrokCliPhasePolicy({path:f.policyPath,env:f.env});
  assert.notEqual(loaded.digest,oldPin);
  await assert.rejects(loadGrokCliPhasePolicy({path:f.policyPath,env:{GODAGENT_GROK_PHASE_POLICY_SHA256:oldPin}}),{code:'policy-integrity'});
  for(const bad of [null,'','json','json-schema-v2',{},true]) {
    await select(f,bad);await assert.rejects(loadGrokCliPhasePolicy({path:f.policyPath,env:f.env}),{code:'policy-invalid'});
  }
  assert.equal(await f.calls(),0);
});
test('compiler delivers the real phase output schema only when host-pinned, without changing mission data',async t=>{
  const f=await grokProcessFixture(t),suite=await createGrokCliPhaseTransportSuite(config(f));
  const dispatches={native:await nativeDispatch(t,suite.descriptors.native),review:await reviewDispatch(suite.descriptors.review),revision:revisionDispatch(suite.descriptors.revision)};
  for(const phase of ['native','review','revision']) {
    const args={phase,dispatch:dispatches[phase],descriptor:suite.descriptors[phase]};
    const plain=compileGrokCliPhaseRequest({...args,policy:f.policy});
    const selected={...f.policy,provider:{...f.policy.provider,structuredOutputProfile:'json-schema-v1'}};
    const structured=compileGrokCliPhaseRequest({...args,policy:selected});
    const a=JSON.parse(plain.body),b=JSON.parse(structured.body);
    assert.equal(Object.hasOwn(a,'outputSchema'),false);
    assert.ok(b.outputSchema,'machine-readable schema must reach the process request');
    assert.equal(b.outputSchema.type,'object');assert.equal(b.outputSchema.additionalProperties,false);
    assert.ok(b.outputSchema.required.includes(phase==='review'?'recommendation':'content'));
    if(phase==='native')assert.deepEqual(b.outputSchema.properties.content,{type:'string',minLength:1,maxLength:16777216});
    const {outputSchema,...rest}=b;assert.deepEqual(rest,a);
    assert.notEqual(structured.requestDigest,plain.requestDigest);
    assert.throws(()=>compileGrokCliPhaseRequest({...args,policy:{...selected,provider:{...selected.provider,structuredOutputProfile:'unknown'}}}),{code:'dispatch-invalid'});
    assert.throws(()=>compileGrokCliPhaseRequest({...args,policy:{...selected,provider:{...selected.provider,maximumRequestBytes:structured.bodyBytes-1}}}),{code:'request-over-budget'});
  }
});
test('all phase senders pass exact constrained schema to the pinned bridge and replay without another process',async t=>{
  const f=await grokProcessFixture(t,'schema-required');await select(f);
  const suite=await createGrokCliPhaseTransportSuite(config(f));
  const dispatches={native:await nativeDispatch(t,suite.descriptors.native),review:await reviewDispatch(suite.descriptors.review),revision:revisionDispatch(suite.descriptors.revision)},results={};
  for(const phase of ['native','review','revision'])results[phase]=await suite[phase].execute(dispatches[phase]);
  assert.equal(results.native.completion.artifact.content,'synthetic native');
  assert.equal(results.review.completion.artifact.recommendation,'accept');
  assert.equal(results.revision.completion.artifact.content,'synthetic revision');
  assert.equal(await f.calls(),3);await unlink(f.authPath);
  const reopened=await createGrokCliPhaseTransportSuite(config(f));
  for(const phase of ['native','review','revision'])assert.deepEqual(await reopened[phase].execute(dispatches[phase]),results[phase]);
  assert.equal(await f.calls(),3);
});
test('constrained requests cannot drop their schema or add it under an unselected profile',async t=>{
  const f=await grokProcessFixture(t),suite=await createGrokCliPhaseTransportSuite(config(f));
  const dispatch=await nativeDispatch(t,suite.descriptors.native);
  const selected={...f.policy,provider:{...f.policy.provider,structuredOutputProfile:'json-schema-v1'}};
  const valid=JSON.parse(compileGrokCliPhaseRequest({phase:'native',dispatch,descriptor:suite.descriptors.native,policy:selected}).body);
  assert.ok(valid.outputSchema);
  for(const [policy,mutate] of [[selected,v=>{delete v.outputSchema;}],[selected,v=>{v.outputSchema=null;}],[f.policy,()=>{}]]) {
    const value=structuredClone(valid);mutate(value);const body=canonicalJson(value),runner=createGrokCliPhaseProcess({policy});
    await assert.rejects(runner.process.invoke({policy,credential:runner.credentialResolver.resolve(),request:{body,bodyBytes:Buffer.byteLength(body),requestDigest:sha256Text(body)}}));
  }
  assert.equal(await f.calls(),0);
});
test('schema control does not authorize malformed output or a new invocation after rejection',async t=>{
  const f=await grokProcessFixture(t,'schema-malformed');await select(f);
  const suite=await createGrokCliPhaseTransportSuite(config(f)),dispatch=await nativeDispatch(t,suite.descriptors.native);
  await assert.rejects(suite.native.execute(dispatch),{code:'response-invalid'});
  await assert.rejects(suite.native.execute(dispatch),{code:'response-invalid'});
  assert.equal(await f.calls(),1);
});

test('actual phase port rejects caller schema injection, stale binding and changed bridge schema before inference',async t=>{
  const f=await grokProcessFixture(t,'schema-tamper');
  const old=await createGrokCliPhaseTransportSuite(config(f)),oldDispatch=await nativeDispatch(t,old.descriptors.native);
  await select(f);const suite=await createGrokCliPhaseTransportSuite(config(f));
  await assert.rejects(suite.native.execute(oldDispatch));assert.equal(await f.calls(),0);
  const dispatch=await nativeDispatch(t,suite.descriptors.native);
  const injected={...dispatch,outputSchema:{type:'object'}};
  const {dispatchDigest,...unsigned}=injected;injected.dispatchDigest=sha256Value(unsigned);
  await assert.rejects(suite.native.execute(injected));assert.equal(await f.calls(),0);
  await assert.rejects(suite.native.execute(dispatch),{code:'provider-ambiguous'});
  assert.equal(await f.calls(),0,'a bridge cannot substitute a different closed schema');
  await assert.rejects(suite.native.execute(dispatch),{code:'operation-pending'});assert.equal(await f.calls(),0);
});
