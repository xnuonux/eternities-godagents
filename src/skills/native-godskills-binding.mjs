import { mkdir, readFile, lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { verifyGodskillsRoutingExecutable } from './routing-executable-verifier.mjs';
import { createRoutingEvidenceActivationClassifier } from './routing-evidence-activation-classifier.mjs';
import { createLocalRecoverableGodskillsAdapter } from './local-recoverable-godskills-adapter.mjs';

const protocol='eternities-native-godskills-policy-v1';
const digest=/^[a-f0-9]{64}$/;
const fail=code=>{throw new Error(`native-godskills:${code}`);};
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>{if(!object(x)||!same(Object.keys(x).sort(),[...keys].sort()))fail('shape');};
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const strings=(x,max=128)=>Array.isArray(x)&&x.length<=max&&new Set(x).size===x.length
  &&x.every(v=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v)<=512&&!/[\0\r\n]/.test(v));
const inside=(root,target)=>{const p=relative(root,target);return p===''||(p!=='..'&&!p.startsWith('..'+sep)&&!isAbsolute(p));};
function freeze(x){if(x&&typeof x==='object'){for(const child of Object.values(x))freeze(child);Object.freeze(x);}return x;}
async function screened(fn){try{return await fn();}catch(error){if(/^native-godskills:[a-z-]+$/.test(error?.message??''))throw error;fail('verification-failed');}}
async function verifySelected(binding,verification) {
  for(const row of binding.receipt.selected) {
    const capability=verification.release.capabilitiesById.get(row.id);
    if(!capability)fail('selected-reference');
    // Verify even an undisclosed selected body. Verification is not injection.
    await verification.release.readSelectedArtifact(capability.entrypoint,'native selected entrypoint');
    await verification.release.readSelectedArtifact(capability.contract,'native selected contract');
  }
}

export function validateNativeGodskillsOptions(options) {
  exact(options,['policy','expectedPolicyDigest']);
  const p=options.policy;
  if(!digest.test(options.expectedPolicyDigest??'')||sha256Value(p)!==options.expectedPolicyDigest)fail('policy-pin');
  exact(p,['schemaVersion','protocolId','releasePin','routingPin','sourceStateEpoch','hostEnvelope','explicitMethodRequests','reviewAvailable','maximumDisclosureBytes']);
  if(p.schemaVersion!==1||p.protocolId!==protocol)fail('protocol');
  if(!object(p.releasePin)||!object(p.routingPin)||!p.releasePin.activation
    ||!isAbsolute(p.releasePin.repositoryRoot??''))fail('release-pin');
  if(!same(p.releasePin.semanticEffectBindings,{read:['local-read'],write:['local-write']}))fail('effect-map');
  if(!integer(p.sourceStateEpoch,0,Number.MAX_SAFE_INTEGER)||typeof p.reviewAvailable!=='boolean'
    ||!integer(p.maximumDisclosureBytes,1,32768)||!strings(p.explicitMethodRequests,3))fail('limits');
  const h=p.hostEnvelope;
  exact(h,['availableAuthority','permittedEffects','availablePreconditions','forbiddenCapabilities','maximumRisk','minimumEvidenceConfidence','contextBudget','maxCompositionSize']);
  for(const key of ['availableAuthority','permittedEffects','availablePreconditions','forbiddenCapabilities'])if(!strings(h[key]))fail('host-envelope');
  if(!h.permittedEffects.length||!['low','moderate','high'].includes(h.maximumRisk)
    ||!['unverified','inferred','verified'].includes(h.minimumEvidenceConfidence)
    ||!integer(h.contextBudget,1,100000)||!integer(h.maxCompositionSize,1,3))fail('host-envelope');
  if(Buffer.byteLength(canonicalJson(options))>128*1024)fail('policy-size');
  return options;
}

export async function preflightNativeGodskills({options,candidate,request,grant,effectCeiling,artifactCache=new Map()}) {
  return screened(async()=>{
    validateNativeGodskillsOptions(options);
    const p=structuredClone(options.policy),h=p.hostEnvelope,envelope=candidate.fullEnvelope;
    if(!Array.isArray(effectCeiling)||h.permittedEffects.some(e=>!effectCeiling.includes(e)
      ||!envelope.identity.constitution.allowedEffects.includes(e)))fail('effect-ceiling');
    for(const a of h.availableAuthority) {
      if(['local-read','local-write','process-exec'].includes(a)&&!h.permittedEffects.includes(a))fail('authority-ceiling');
      if(a==='repository-write'&&!h.permittedEffects.includes('local-write'))fail('authority-ceiling');
    }
    const cwd=await realpath(grant.cwd),root=await realpath(p.releasePin.repositoryRoot);
    if(inside(cwd,root))fail('release-inside-workspace');
    const verification=await verifyGodskillsRoutingExecutable({releasePin:p.releasePin,routingPin:p.routingPin,artifactCache});
    const {selectedIds:ignored,selectedContractDigests:ignored2,...genomePolicy}=envelope.capability.godskills;
    const input={mission:{requestId:request.task.taskId+':'+request.mission.missionId,
      text:request.mission.objective,authority:[...h.availableAuthority],explicitMethodRequests:p.explicitMethodRequests},
      observation:request.mission.observation,genomePolicy,
      hostEnvelope:{...h,constitutionAllowedEffects:[...envelope.identity.constitution.allowedEffects],
        realmHandContractDigest:envelope.authority.realmContractDigest},sourceStateEpoch:p.sourceStateEpoch};
    return {policy:p,verification,input};
  });
}

export async function prepareNativeGodskills(args) {
  return screened(async()=>{
    const options=structuredClone(args.options),candidate=structuredClone(args.candidate),request=structuredClone(args.request),grant=structuredClone(args.grant);
    const artifactCache=new Map();
    const preparedArgs={options,candidate,request,grant,effectCeiling:[...args.effectCeiling],artifactCache};
    const {policy,verification,input}=await preflightNativeGodskills(preparedArgs);
    await mkdir(args.stateDirectory,{recursive:true});
    const root=await realpath(args.stateDirectory),cwd=await realpath(grant.cwd);
    if(inside(cwd,root))fail('state-inside-workspace');
    const path=join(root,'godskills.json');
    const read=async()=>{
      const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>512*1024)fail('record-shape');
      const text=await readFile(path,'utf8'),value=JSON.parse(text),{recordDigest,...body}=value;
      if(value.schemaVersion!==1||value.protocolId!=='eternities-native-godskills-binding-v1'
        ||!digest.test(recordDigest??'')||sha256Value(body)!==recordDigest||text!==canonicalJson(value)+'\n')fail('record-integrity');
      return value;
    };
    const identity={policyDigest:options.expectedPolicyDigest,candidateDigest:candidate.candidateDigest,
      grantDigest:sha256Value(grant),inputDigest:sha256Value(input)};
    let existing;try{existing=await read();}catch(error){if(error.code!=='ENOENT')throw error;}
    if(args.resume&&!existing)fail('missing-binding');
    if(!args.resume&&existing)fail('already-bound');
    if(existing&&Object.entries(identity).some(([key,value])=>existing[key]!==value))fail('binding-mismatch');
    const classifier=createRoutingEvidenceActivationClassifier({verifiedRoutingExecutable:verification,reviewAvailable:policy.reviewAvailable});
    const adapter=await createLocalRecoverableGodskillsAdapter({admissionRoot:join(root,'godskills-outbox'),
      releasePin:policy.releasePin,routingPin:policy.routingPin,activationClassifier:classifier.classify,artifactCache});
    const binding=existing?await adapter.rehydrateMission({receipt:existing.binding.receipt,...input}):await adapter.bindMission(input);
    if(binding.status!=='bound'||!binding.receipt||!binding.cortexPackage)fail('unresolved-route');
    await verifySelected(binding,verification);
    if(existing&&!same(binding,existing.binding))fail('binding-mismatch');
    const disclosure=freeze({status:'bound',receiptDigest:sha256Value(binding.receipt),
      reviewExecution:binding.cortexPackage.deferredReviews?.length?'scheduled-only':'not-scheduled',package:binding.cortexPackage});
    if(Buffer.byteLength(canonicalJson(disclosure))>Math.min(policy.maximumDisclosureBytes,
      policy.releasePin.maximumPackageBytes,policy.hostEnvelope.contextBudget*4))fail('disclosure-overflow');
    const body={schemaVersion:1,protocolId:'eternities-native-godskills-binding-v1',...identity,
      classificationDescriptorDigest:classifier.descriptor.descriptorDigest,localExecution:adapter.localExecution,
      binding,disclosureDigest:sha256Value(disclosure)};
    const record=freeze({...body,recordDigest:sha256Value(body)});
    if(existing&&!same(existing,record))fail('binding-mismatch');
    if(!existing&&!await publishFileExclusive({destinationPath:path,content:canonicalJson(record)+'\n'}))fail('binding-collision');
    return Object.freeze({recordDigest:record.recordDigest,disclosure,
      async validate(){return screened(async()=>{
        if(!same(await read(),record))fail('record-changed');
        const current=await preflightNativeGodskills(preparedArgs);
        await verifySelected(record.binding,current.verification);
        const recovered=await adapter.rehydrateMission({receipt:record.binding.receipt,...input});
        if(!same(recovered,record.binding))fail('binding-mismatch');
        return disclosure;
      });},
    });
  });
}
