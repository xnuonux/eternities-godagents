import { mkdir, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildIdentityBoundNativeTransportDescriptor } from '../runtime/identity-bound-native-contracts.mjs';
import { buildGodskillsReviewTransportDescriptor } from '../skills/review-transport-contracts.mjs';
import { buildMissionRevisionTransportDescriptor } from '../runtime/mission-revision-transport-contracts.mjs';
import { buildPortablePhaseHostDescription, createPortablePhaseHostAdapter } from '../sdk/portable-phase-host.mjs';
import { loadGrokCliPhasePolicy } from './grok-cli-phase-policy.mjs';
import { createGrokCliPhaseProcess } from './grok-cli-phase-process.mjs';
import { compileGrokCliPhaseRequest, inspectGrokCliPhaseResponse, verifyGrokCliProviderEvidence } from './grok-cli-phase-protocol.mjs';
import { createDurablePhaseOperationSuite } from './durable-phase-operation.mjs';
import { loadProviderPhaseResolutionPolicy } from './provider-phase-resolution.mjs';
import { projectGrokCliRejectionDiagnostic, persistGrokCliRejectionDiagnostic } from './grok-cli-rejection-diagnostic.mjs';

export async function createGrokCliPhaseTransportSuite({policyPath,env,runtimeRoot,
  clock=()=>new Date().toISOString(),checkpoint=async()=>{},lockOptions={}}={}) {
  if (typeof runtimeRoot !== 'string' || !runtimeRoot.length || /[\x00-\x1f]/.test(runtimeRoot)
      || typeof clock !== 'function' || typeof checkpoint !== 'function') throw new TypeError('Grok phase suite configuration is invalid');
  const {policy,digest}=await loadGrokCliPhasePolicy({path:policyPath,env});
  const runner=createGrokCliPhaseProcess({policy});
  const descriptors=Object.freeze({
    native:buildIdentityBoundNativeTransportDescriptor({transportId:`grok-cli-native:${digest}`,
      maximumDispatchBytes:policy.phases.native.maximumDispatchBytes,maximumCompletionBytes:policy.phases.native.maximumCompletionBytes}),
    review:buildGodskillsReviewTransportDescriptor({transportId:`grok-cli-review:${digest}`,
      maximumCompletionBytes:policy.phases.review.maximumCompletionBytes}),
    revision:buildMissionRevisionTransportDescriptor({transportId:`grok-cli-revision:${digest}`,
      maximumCompletionBytes:policy.phases.revision.maximumCompletionBytes}),
  });
  await mkdir(resolve(runtimeRoot),{recursive:true});
  const root=await realpath(resolve(runtimeRoot));
  function inspectResponse(options) {
    try { return inspectGrokCliPhaseResponse(options); }
    catch(error) {
      if(error?.code==='response-invalid'&&error.stage) {
        try {
          const request=compileGrokCliPhaseRequest(options);
          const diagnostic=projectGrokCliRejectionDiagnostic({phase:options.phase,policyDigest:digest,
            dispatchDigest:options.dispatch.dispatchDigest,requestDigest:request.requestDigest,
            modelId:policy.provider.modelId,stage:error.stage,maximumResponseBytes:policy.provider.maximumResponseBytes,
            bodyText:options.response.bodyText});
          persistGrokCliRejectionDiagnostic({runtimeRoot:root,diagnostic});
        } catch {
          // Best-effort diagnostics are not authority or a recovery decision.
          // Their persistence failure must never mask the original rejection.
        }
      }
      throw error;
    }
  }
  const phases=await createDurablePhaseOperationSuite({policy,policyDigest:digest,descriptors,runtimeRoot:root,
    credentialResolver:runner.credentialResolver,process:runner.process,
    compileRequest:compileGrokCliPhaseRequest,inspectResponse,
    verifyProviderEvidence:value=>verifyGrokCliProviderEvidence(value,{modelId:policy.provider.modelId,
      reportedModelId:policy.provider.reportedModelId}),clock,checkpoint,lockOptions,checkpointPrefix:'grok-cli-phase'});
  async function createOperatorResolutionController({policyPath:resolutionPath,env:resolutionEnv}={}) {
    const loaded=await loadProviderPhaseResolutionPolicy({path:resolutionPath,env:resolutionEnv,
      transportPolicyDigest:digest,maximumProviderResponseBytes:policy.provider.maximumResponseBytes});
    return phases.createOperatorResolutionController(loaded);
  }
  return Object.freeze({policyDigest:digest,descriptors,native:phases.native,review:phases.review,revision:phases.revision,
    assertCredentialAbsent:runner.assertCredentialAbsent,createOperatorResolutionController});
}

export async function createGrokCliPortablePhaseHost(options={}) {
  const suite=await createGrokCliPhaseTransportSuite(options);
  const description=buildPortablePhaseHostDescription({adapterId:'grok-cli-subscription',adapterVersion:'1.0.0',
    policyDigest:suite.policyDigest,descriptors:suite.descriptors});
  return createPortablePhaseHostAdapter({description,native:suite.native,review:suite.review,revision:suite.revision,
    assertCredentialAbsent:suite.assertCredentialAbsent,createOperatorResolutionController:suite.createOperatorResolutionController});
}
