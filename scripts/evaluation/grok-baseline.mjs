import { runAttempt, diagnosticFailure, diagnosticFallback } from './attempt.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { assertNoCredentialFields } from '../../src/cortex/receipt-safety.mjs';
import { verifyGrokCliProviderEvidence } from '../../src/transports/grok-cli-phase-protocol.mjs';

// Operational comparison collector, not an agent completion or new verifier.
// dispatch owns the pinned, sterile subscription process and all launch ceilings.
// No raw answer, error message, credentials or hidden reasoning enters the journal.
export async function runGrokBaseline({directory,policy,dispatch,assertResponseSafe,prepareAnswer,stageAnswer}) {
  if([dispatch,assertResponseSafe,prepareAnswer,stageAnswer].some(fn=>typeof fn!=='function')
      || !Number.isSafeInteger(policy?.provider?.maximumResponseBytes) || policy.provider.maximumResponseBytes<1
      || !Number.isSafeInteger(policy?.phases?.native?.maximumCompletionBytes) || policy.phases.native.maximumCompletionBytes<1
      || !Number.isSafeInteger(policy?.phases?.native?.maximumCompletionTokens) || policy.phases.native.maximumCompletionTokens<1) {
    throw Error('invalid Grok baseline configuration');
  }
  return runAttempt(directory,async journal=>{
    await journal.dispatchStarted();
    let response;
    try { response=await dispatch(); } catch(error) { throw diagnosticFallback(error,'transport-failure'); }
    if(response?.kind!=='subprocess-json-v1' || response.outcome!=='completed' || response.exitCode!==0
        || typeof response.bodyText!=='string') throw diagnosticFailure('response-envelope');
    if(Buffer.byteLength(response.bodyText)>policy.provider.maximumResponseBytes) throw diagnosticFailure('response-ceiling');
    try { await assertResponseSafe(response.bodyText); } catch(error) { throw diagnosticFallback(error,'response-safety-check-failed'); }
    let value;
    try { value=JSON.parse(response.bodyText); } catch { throw diagnosticFailure('response-json'); }
    if(value?.stopReason!=='end_turn' || typeof value.text!=='string') throw diagnosticFailure('response-envelope');

    let providerUsage;
    try {
      const u=value.usage;
      const reported=Object.hasOwn(u,'cache_creation_input_tokens');
      const creation=reported?u.cache_creation_input_tokens:u.total_tokens-u.input_tokens-u.cache_read_input_tokens-u.output_tokens;
      const raw=Object.fromEntries(['num_turns','model','usage_is_incomplete','cost_is_partial','total_cost_usd','total_cost_usd_ticks']
        .filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
      raw.usage=u;raw.modelUsage=value.modelUsage;
      const {modelId,reportedModelId=modelId}=policy.provider;
      const candidate={usageProfile:'grok-headless-additive-v1',modelId,raw,
        ...(reportedModelId!==modelId?{reportedModelId}:{}),
        modelAttribution:Object.hasOwn(value,'model')?'top-level-and-per-model-ledger':'per-model-ledger-only',
        cacheCreationInputTokens:creation,cacheCreationOrigin:reported?'reported':'derived-from-total',
        normalized:{inputTokens:u.input_tokens+u.cache_read_input_tokens+creation,cachedInputTokens:u.cache_read_input_tokens,
          reasoningTokens:u.reasoning_tokens,visibleOutputTokens:u.output_tokens-u.reasoning_tokens,completionTokens:u.output_tokens},
        reportingScope:'reported-prompt-ledger-not-physical-call-count',actualCharge:'unknown'};
      providerUsage=verifyGrokCliProviderEvidence(candidate,{modelId,reportedModelId});
      if(providerUsage.normalized.completionTokens>policy.phases.native.maximumCompletionTokens) throw Error();
    } catch { throw diagnosticFailure('usage-invalid'); }
    const {inputTokens,completionTokens,reasoningTokens,cachedInputTokens}=providerUsage.normalized;
    // Persist before answer decoding, proposal validation, or revision staging.
    // A failed write propagates and prevents any downstream acceptance.
    await journal.recordUsage({inputTokens,completionTokens,reasoningTokens,cachedInputTokens});
    let answer;
    try {
      answer=JSON.parse(value.text);
      assertNoCredentialFields(answer);
      if(!answer || Array.isArray(answer) || Object.keys(answer).join(',')!=='content'
          || typeof answer.content!=='string' || !answer.content.length || answer.content.length>16777216
          || Buffer.byteLength(canonicalJson(answer))>policy.phases.native.maximumCompletionBytes) throw Error();
    } catch { throw diagnosticFailure('answer-envelope'); }
    let prepared;
    try { prepared=await prepareAnswer(JSON.parse(answer.content)); }
    catch { throw diagnosticFailure('workspace-proposal-invalid'); }
    try { await stageAnswer(prepared,{providerUsage,usage:providerUsage.normalized}); }
    catch { throw diagnosticFailure('workspace-stage-failed'); }
    await journal.completed();
  });
}
