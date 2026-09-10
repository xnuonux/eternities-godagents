import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildIdentityBoundNativeTransportDescriptor } from '../src/runtime/identity-bound-native-contracts.mjs';
import { buildGodskillsReviewTransportDescriptor } from '../src/skills/review-transport-contracts.mjs';
import { buildMissionRevisionTransportDescriptor } from '../src/runtime/mission-revision-transport-contracts.mjs';
import { nativeDispatch, reviewDispatch, revisionDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { guidanceFixture } from './helpers/operating-guidance-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { compileOpenAICompatiblePhaseRequest } from '../src/transports/openai-compatible-phase-protocol.mjs';
import { compileAnthropicMessagesPhaseRequest } from '../src/transports/anthropic-messages-phase-protocol.mjs';
import { compileGrokCliPhaseRequest } from '../src/transports/grok-cli-phase-protocol.mjs';

const entries = [
  ['openai', compileOpenAICompatiblePhaseRequest, validOpenAICompatiblePhasePolicy],
  ['anthropic', compileAnthropicMessagesPhaseRequest, validAnthropicMessagesPhasePolicy],
  ['grok', compileGrokCliPhaseRequest, () => ({
    provider: { modelId: 'grok-4.6', reasoningEffort: 'low', usageProfile: 'grok-headless-additive-v1', maximumRequestBytes: 1048576 },
    phases: { native: { maximumCompletionTokens: 16000 }, review: { maximumCompletionTokens: 16000 }, revision: {maximumCompletionTokens:16000} },
  })],
];

for (const [name, compile, policyFactory] of entries) {
  test(`${name}: selected review and revision keep the exact Godskills package and output contract`,async()=>{
    for (const phase of ['review','revision']) {
      const descriptor = phase === 'review'
        ? buildGodskillsReviewTransportDescriptor({transportId:'guidance-review-selected',maximumCompletionBytes:65536})
        : buildMissionRevisionTransportDescriptor({transportId:'guidance-revision-selected',maximumCompletionBytes:65536});
      const dispatch = phase === 'review' ? await reviewDispatch(descriptor) : revisionDispatch(descriptor);
      const packageValue=guidanceFixture();
      packageValue.phases=['review','revision'];
      const {packageDigest,...unsigned}=packageValue;
      packageValue.packageDigest=sha256Value(unsigned);
      const args={phase,dispatch,descriptor};
      const baseline=JSON.parse(compile({...args,policy:policyFactory()}).body);
      const selected=JSON.parse(compile({...args,policy:{...policyFactory(),operatingGuidance:packageValue}}).body);
      const system=name==='anthropic'? selected.system[0].text:selected.messages[0].content;
      assert.ok(system.includes(packageValue.sections[0].text));
      assert.deepEqual(selected.messages.at(-1),baseline.messages.at(-1));
      assert.deepEqual(selected.response_format,baseline.response_format);
      assert.deepEqual(selected.output_config,baseline.output_config);
    }
  });
  test(`${name}: selected conduct reaches system instructions without changing mission or identity`, async t => {
    const descriptor = buildIdentityBoundNativeTransportDescriptor({ transportId: 'guidance-native', maximumDispatchBytes: 1048576, maximumCompletionBytes: 65536 });
    const dispatch = await nativeDispatch(t, descriptor);
    const before = canonicalJson(dispatch);
    const policy = policyFactory();
    const args = {phase: 'native', dispatch, descriptor};
    const baseline = compile({...args, policy});
    const selected = compile({...args, policy: {...policy, operatingGuidance: guidanceFixture()}});
    const request = JSON.parse(selected.body);
    const original = JSON.parse(baseline.body);
    const system = name === 'anthropic' ? request.system[0].text : request.messages[0].content;
    assert.ok(system.includes(guidanceFixture().sections[0].text));
    assert.deepEqual(request.messages.at(-1), original.messages.at(-1));
    assert.equal(canonicalJson(dispatch), before);
    assert.notEqual(selected.requestDigest, baseline.requestDigest);
    assert.deepEqual(compile({...args, policy}), baseline);
    assert.throws(() => compile({...args, policy: {...policy, operatingGuidance: guidanceFixture(), provider: {...policy.provider, maximumRequestBytes: baseline.bodyBytes}}}), {code:'request-over-budget'});
  });

  test(`${name}: unselected phases stay byte-identical and malformed selections never silently disappear`, async () => {
    const descriptor = buildGodskillsReviewTransportDescriptor({transportId:'guidance-review', maximumCompletionBytes:65536});
    const dispatch = await reviewDispatch(descriptor);
    const policy = policyFactory();
    const args = {phase:'review',dispatch,descriptor};
    assert.deepEqual(compile({...args,policy:{...policy,operatingGuidance:guidanceFixture()}}), compile({...args,policy}));
    const mutations = [
      () => null,
      p => ({...p,protocolId:'unknown'}),
      p => ({...p,sections:[{...p.sections[0],text:'changed'}]}),
      p => ({...p,phases:['review','native']}),
      p => ({...p,sourceRepository:'https://example.test/quarry'}),
      p => ({...p,authority:['external-send']}),
      () => guidanceFixture('宇宙'.repeat(5000)),
    ];
    for (const mutate of mutations) {
      let invalid = mutate(guidanceFixture());
      if (invalid) { const {packageDigest, ...unsigned} = invalid; invalid.packageDigest = sha256Value(unsigned); }
      assert.throws(() => compile({...args,policy:{...policy,operatingGuidance:invalid}}));
    }
  });
}
