import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { guidanceFixture } from './helpers/operating-guidance-fixture.mjs';
import { grokProcessFixture } from './helpers/grok-cli-process-fixture.mjs';
import { nativeDispatch, recoveredNativeResponse } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { createGrokCliPhaseTransportSuite } from '../src/transports/grok-cli-phase-transport.mjs';
import { loadOpenAICompatiblePhaseTransportPolicy } from '../src/transports/openai-compatible-phase-policy.mjs';
import { loadAnthropicMessagesPhaseTransportPolicy } from '../src/transports/anthropic-messages-phase-policy.mjs';
import { createOpenAICompatiblePhaseTransportSuite } from '../src/transports/openai-compatible-phase-transport.mjs';
import { createAnthropicMessagesPhaseTransportSuite } from '../src/transports/anthropic-messages-phase-transport.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';

const options = f => ({policyPath:f.policyPath, env:f.env, runtimeRoot:join(f.root,'operations')});
async function pin(f) {
  await writeFile(f.policyPath, canonicalJson(f.policy)+'\n');
  f.env.GODAGENT_GROK_PHASE_POLICY_SHA256 = sha256Value(f.policy);
}

test('guidance reaches actual process prompt from fresh admission and replays without another launch', async t => {
  const f = await grokProcessFixture(t,'operating-guidance');
  f.policy.operatingGuidance = guidanceFixture();
  await pin(f);
  const suite = await createGrokCliPhaseTransportSuite(options(f));
  const dispatch = await nativeDispatch(t,suite.descriptors.native);
  const before = canonicalJson(dispatch);
  const result = await suite.native.execute(dispatch);
  assert.ok(result.completion.artifact.content.includes(f.policy.operatingGuidance.sections[0].text));
  assert.ok(result.completion.artifact.content.includes(f.policy.operatingGuidance.packageDigest));
  assert.equal(canonicalJson(dispatch), before);
  const prepared = JSON.parse(await readFile(join(f.root,'operations','native',dispatch.dispatchDigest,'prepared.json'),'utf8'));
  assert.equal(prepared.policyDigest,sha256Value(f.policy));
  await unlink(f.authPath);
  const restarted = await createGrokCliPhaseTransportSuite(options(f));
  assert.deepEqual(await restarted.native.execute(dispatch), result);
  assert.equal(await f.calls(),1);
});

test('guidance migration needs a new policy pin and cannot rebind an old dispatch', async t => {
  const f = await grokProcessFixture(t);
  f.policy.operatingGuidance = guidanceFixture();
  await pin(f);
  const old = await createGrokCliPhaseTransportSuite(options(f));
  const dispatch = await nativeDispatch(t,old.descriptors.native);
  f.policy.operatingGuidance = guidanceFixture('Use concise task checkpoints.\n');
  await writeFile(f.policyPath,canonicalJson(f.policy)+'\n');
  await assert.rejects(createGrokCliPhaseTransportSuite(options(f)),{code:'policy-integrity'});
  await pin(f);
  const changed = await createGrokCliPhaseTransportSuite(options(f));
  await assert.rejects(changed.native.execute(dispatch));
  assert.equal(await f.calls(),0);
  const selectedPin = f.env.GODAGENT_GROK_PHASE_POLICY_SHA256;
  delete f.policy.operatingGuidance;
  await writeFile(f.policyPath,canonicalJson(f.policy)+'\n');
  f.env.GODAGENT_GROK_PHASE_POLICY_SHA256 = selectedPin;
  await assert.rejects(createGrokCliPhaseTransportSuite(options(f)),{code:'policy-integrity'});
});

test('selected guidance does not turn uncertain execution into a retry', async t => {
  const f = await grokProcessFixture(t,'uncertain');
  f.policy.operatingGuidance = guidanceFixture();
  await pin(f);
  const suite = await createGrokCliPhaseTransportSuite(options(f));
  const dispatch = await nativeDispatch(t,suite.descriptors.native);
  await assert.rejects(suite.native.execute(dispatch),{code:'provider-ambiguous'});
  const restarted = await createGrokCliPhaseTransportSuite(options(f));
  assert.deepEqual(await restarted.native.reconcile(dispatch),{status:'pending'});
  await assert.rejects(restarted.native.execute(dispatch),{code:'operation-pending'});
  assert.equal(await f.calls(),1);
});

for (const [name,factory,load,pinName] of [
  ['openai',validOpenAICompatiblePhasePolicy,loadOpenAICompatiblePhaseTransportPolicy,'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256'],
  ['anthropic',validAnthropicMessagesPhasePolicy,loadAnthropicMessagesPhaseTransportPolicy,'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256'],
]) {
  test(`${name}: the durable sender delivers guidance then replays without HTTP or credentials`,async t=>{
    const f=await grokProcessFixture(t);
    const policy={...factory(),operatingGuidance:guidanceFixture()};
    await writeFile(f.policyPath,canonicalJson(policy)+'\n');
    const env={[pinName]:sha256Value(policy),[policy.provider.credentialEnv]:'synthetic-guidance-credential'};
    let received=null,calls=0;
    const create=name==='openai'?createOpenAICompatiblePhaseTransportSuite:createAnthropicMessagesPhaseTransportSuite;
    const config={policyPath:f.policyPath,env,runtimeRoot:join(f.root,'http-operations'),fetchImpl:async(url,options)=>{
      calls++; received=JSON.parse(options.body);
      const body=name==='openai'?recoveredNativeResponse().bodyText:canonicalJson({
        type:'message',id:'msg_guidance',role:'assistant',model:policy.provider.modelId,
        content:[{type:'text',text:canonicalJson({content:'synthetic checked response'})}],
        stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:200,output_tokens:30},
      });
      return new Response(body,{status:200,headers:{'content-type':'application/json'}});
    }};
    const suite=await create(config);
    const dispatch=await nativeDispatch(t,suite.descriptors.native);
    const result=await suite.native.execute(dispatch);
    const system=name==='openai'?received.messages[0].content:received.system[0].text;
    assert.ok(system.includes(policy.operatingGuidance.sections[0].text));
    delete env[policy.provider.credentialEnv];
    const reopened=await create(config);
    assert.deepEqual(await reopened.native.execute(dispatch),result);
    assert.equal(calls,1);
  });
  test(`${name} loader binds and freezes selected conduct and rejects invalid bytes even under a new pin`,async t=>{
    const f = await grokProcessFixture(t);
    const policy = {...factory(),operatingGuidance:guidanceFixture()};
    await writeFile(f.policyPath,canonicalJson(policy)+'\n');
    const loaded = await load({path:f.policyPath,env:{[pinName]:sha256Value(policy)}});
    assert.deepEqual(loaded.policy.operatingGuidance,policy.operatingGuidance);
    assert.ok(Object.isFrozen(loaded.policy.operatingGuidance.sections[0]));
    policy.operatingGuidance.sections[0].text='tampered';
    await writeFile(f.policyPath,canonicalJson(policy)+'\n');
    await assert.rejects(load({path:f.policyPath,env:{[pinName]:sha256Value(policy)}}),{code:'policy-invalid'});
  });
}
