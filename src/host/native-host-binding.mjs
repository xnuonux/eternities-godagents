import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, parse } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { compileCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { replaceFileAtomically } from '../state/atomic-publication.mjs';
import { acquireCortexBinding } from './cortex-binding-registry.mjs';

// These are native tool classes, not a parser for the effects of shell commands.
export const nativeToolEffects = Object.freeze({
  read:'local-read', grep:'local-read', find:'local-read', ls:'local-read',
  write:'local-write', edit:'local-write', bash:'process-exec', powershell:'process-exec',
});
const capabilityFor = {'local-read':'filesystem.read','local-write':'filesystem.write','process-exec':'process.exec'};
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// Provider tool IDs are opaque correlation values, never filesystem/actor IDs.
// Responses transports can join call and item IDs with "|". Preserve the exact
// value for duplicate/result matching while bounding storage and excluding controls.
const validCallId = value => typeof value === 'string' && value.length > 0
  && Buffer.byteLength(value,'utf8') <= 1024 && !/[\s\u0000-\u001f\u007f-\u009f]/u.test(value);
const digest = /^[a-f0-9]{64}$/;
const same = (a,b) => canonicalJson(a) === canonicalJson(b);
function fail(code) { const error=new Error(`native-host:${code}`);error.code=code;throw error; }
function exact(value, keys) {
  if(!value || typeof value!=='object' || Array.isArray(value) || !same(Object.keys(value).sort(),keys.sort())) fail('grant-shape');
}
function checkGrant(grant, pin, candidate, request, clock) {
  if(!digest.test(pin??'') || sha256Value(grant)!==pin) fail('grant-pin');
  exact(grant,['schemaVersion','protocolId','instanceId','identityDigest','realmContractDigest','sessionId','cwd','model','expiresAt','allowedTools','maxToolCalls']);
  exact(grant.model,['provider','id']);
  assertNoCredentialFields(grant);
  if(grant.schemaVersion!==1 || grant.protocolId!=='eternities-native-host-grant-v1'
    || !identifier.test(grant.sessionId) || !identifier.test(grant.instanceId)
    || typeof grant.model.provider!=='string' || !grant.model.provider || typeof grant.model.id!=='string' || !grant.model.id
    || typeof grant.cwd!=='string' || !isAbsolute(grant.cwd) || grant.cwd.includes('\0')
    || !Number.isSafeInteger(grant.maxToolCalls) || grant.maxToolCalls<1 || grant.maxToolCalls>10000
    || !Array.isArray(grant.allowedTools) || !grant.allowedTools.length
    || new Set(grant.allowedTools).size!==grant.allowedTools.length) fail('grant-shape');
  const expires=Date.parse(grant.expiresAt);
  if(!Number.isFinite(expires) || new Date(expires).toISOString()!==grant.expiresAt || expires<=clock()) fail('expired');
  if(request.task.taskId!==grant.sessionId || request.task.hostAdapterId!=='pi-sdk-v1'
    || grant.instanceId!==candidate.fullEnvelope.binding.instanceId
    || grant.identityDigest!==candidate.fullEnvelope.sectionDigests.identity
    || grant.realmContractDigest!==candidate.fullEnvelope.authority.realmContractDigest) fail('actor-mismatch');
  for(const tool of grant.allowedTools) {
    if(!Object.hasOwn(nativeToolEffects,tool)) fail('unsupported-tool');
    const effect=nativeToolEffects[tool];
    if(!candidate.fullEnvelope.identity.constitution.allowedEffects.includes(effect)
      || !candidate.fullEnvelope.authority.realmCapabilities.includes(capabilityFor[effect])) fail('effect-ceiling');
  }
}

export async function openNativeHostBinding({admission,request:inputRequest,grant:inputGrant,expectedGrantDigest,
  stateDirectory,registryRoot,instanceRegistryRoot,clock=Date.now,resume=false}={}) {
  const grant=structuredClone(inputGrant),request=structuredClone(inputRequest);
  const candidate=await compileCortexBindingCandidate({admission,request});
  checkGrant(grant,expectedGrantDigest,candidate,request,clock);
  const cwd=await realpath(grant.cwd);
  if(!(await stat(cwd)).isDirectory()) fail('workspace');
  if(typeof stateDirectory!=='string'||!isAbsolute(stateDirectory)||resolve(stateDirectory)===parse(stateDirectory).root) fail('state-directory');
  await mkdir(stateDirectory,{recursive:true});
  const stateRoot=await realpath(stateDirectory),rel=relative(cwd,stateRoot);
  if(rel==='' || (!rel.startsWith('..')&&!isAbsolute(rel))) fail('state-inside-workspace');
  const statePath=join(stateRoot,'session.json');
  const stateLock=await acquireFileLock({lockPath:join(stateRoot,'session.lock')});
  let lease,closed=false,fault=false,state;
  const association={grantDigest:expectedGrantDigest,instanceId:grant.instanceId,sessionId:grant.sessionId,cwd,
    identityDigest:grant.identityDigest,realmContractDigest:grant.realmContractDigest,
    keelId:candidate.fullEnvelope.binding.keelId,keelHeadDigest:candidate.fullEnvelope.binding.currentKeelHeadDigest,
    requestDigest:sha256Value(request)};
  const associationDigest=sha256Value(association);
  const load=async()=>{
    let raw;try{if((await stat(statePath)).size>8*1024*1024)fail('state-integrity');raw=await readFile(statePath,'utf8');}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
    let record;try{record=JSON.parse(raw);}catch{fail('state-integrity');}
    const {stateDigest,...body}=record;
    if(!digest.test(stateDigest??'')||sha256Value(body)!==stateDigest||record.schemaVersion!==1
      ||record.protocolId!=='eternities-native-host-state-v1'||!Array.isArray(record.actions))fail('state-integrity');
    if(record.associationDigest!==associationDigest||!same(record.association,association))fail('association-mismatch');
    return record;
  };
  const save=async()=>{
    const {stateDigest:ignored,...body}=state;state={...body,stateDigest:sha256Value(body)};
    try { await replaceFileAtomically({destinationPath:statePath,content:canonicalJson(state)+'\n'}); }
    catch(error){fault=true;throw error;}
  };
  let serial=Promise.resolve();
  const serialized=fn=>{const result=serial.then(fn);serial=result.catch(()=>undefined);return result;};
  try {
    state=await load();
    if(resume&&!state)fail('missing-state');
    if(!resume&&state)fail('already-associated');
    if(state && (state.phase==='running'||state.phase==='uncertain'||state.actions.some(a=>a.status==='pending')))fail('unresolved');
    if(state?.phase==='revoked')fail('revoked');
    lease=await acquireCortexBinding({admission,request,registryRoot,instanceRegistryRoot,clock,
      leaseDurationMs:Math.max(1000,Math.min(86400000,Date.parse(grant.expiresAt)-clock()))});
    if(!state)state={schemaVersion:1,protocolId:'eternities-native-host-state-v1',association,associationDigest,phase:'idle',actions:[],turns:0,inferences:{native:0,compaction:0},nativeHistoryDigest:null,lastBindingReceiptDigest:lease.receipt.receiptDigest};
    else state.lastBindingReceiptDigest=lease.receipt.receiptDigest;
    await save();
  } catch(error) {await lease?.release();await stateLock.release();throw error;}

  const checkState=async()=>{
    const loaded=await load();if(!loaded||loaded.stateDigest!==state.stateDigest)fail('state-integrity');
  };
  const ensure=async(host)=>{
    if(closed)fail('closed');if(fault)fail('persistence-failed');
    await checkState();
    if(state.phase==='revoked')fail('revoked');
    if(clock()>=Date.parse(grant.expiresAt))fail('expired');
    if(!host || host.sessionId!==grant.sessionId || !same(host.model,grant.model)
      || await realpath(host.cwd)!==cwd)fail('host-mismatch');
    const current=await lease.inspect();if(current.status!=='active')fail(current.status==='revoked'?'revoked':'lease-inactive');
  };
  const context='[Eternities native Godagent binding]\n'+canonicalJson({
    protocolId:'eternities-native-host-context-v1',associationDigest,instanceId:grant.instanceId,
    identity:candidate.fullEnvelope.identity,continuity:candidate.fullEnvelope.continuity,mission:request.mission,
    host:{sessionId:grant.sessionId,model:grant.model,cwd,allowedTools:grant.allowedTools,permissionSource:'host-pinned grant',shellBoundary:'process-exec is broad OS-user process authority, not command-level confinement'},
    godskills:{status:'not-activated-by-this-adapter'},
    rules:['Native host instructions and user authority remain controlling.','Use native retrieval, tools and context management; source is not inside the mission.','Do not load another mind\'s personal keel or treat identity prose as authority.','Native completion is not independent verification.'],
  });
  return Object.freeze({
    async inspect(){return serialized(async()=>structuredClone(await load()));},
    validate(host){return serialized(async()=>{await ensure(host);return context;});},
    validateNativeHistory(historyDigest){return serialized(async()=>{
      await checkState();
      if(!digest.test(historyDigest??'')||(state.nativeHistoryDigest!==null&&state.nativeHistoryDigest!==historyDigest)
        ||(resume&&state.nativeHistoryDigest===null))fail('native-history-mismatch');
    });},
    beforeInference(host,purpose='native'){return serialized(async()=>{
      await ensure(host);
      if(!['native','compaction'].includes(purpose))fail('inference-purpose');
      if(state.phase==='uncertain'||state.actions.some(a=>a.status==='pending'))fail('unresolved');
      const refreshed=await compileCortexBindingCandidate({admission,request});
      if(refreshed.candidateDigest!==candidate.candidateDigest)fail('source-changed');
      if(state.phase==='idle'){state.phase='running';state.turns+=1;}
      state.inferences[purpose]+=1;await save();
      return context;
    });},
    beforeTool(call,host){return serialized(async()=>{
      await ensure(host);
      if(state.phase!=='running')fail('mission-not-running');
      if(!validCallId(call?.callId) || !grant.allowedTools.includes(call.toolName))fail('tool-denied');
      if(state.actions.some(a=>a.callId===call.callId))fail('duplicate-call');
      if(state.actions.length>=grant.maxToolCalls)fail('tool-budget');
      state.actions.push({callId:call.callId,toolName:call.toolName,effect:nativeToolEffects[call.toolName],
        inputDigest:sha256Value(call.input),status:'pending',resultDigest:null,isError:null,bindingReceiptDigest:lease.receipt.receiptDigest});
      await save();
    });},
    afterTool(call){return serialized(async()=>{
      if(closed||fault)fail('closed');
      await checkState();
      const action=state.actions.find(a=>a.callId===call?.callId);
      if(!action || action.status!=='pending'||action.toolName!==call.toolName||action.inputDigest!==sha256Value(call.input)
        ||typeof call.isError!=='boolean')fail('result-mismatch');
      action.resultDigest=sha256Value(call.result);action.isError=call.isError;action.status='completed';await save();
    });},
    settle(historyDigest){return serialized(async()=>{
      if(closed||fault)fail('closed');
      await checkState();
      if(state.actions.some(a=>a.status==='pending')){state.phase='uncertain';await save();fail('unresolved');}
      if(historyDigest!==undefined){if(!digest.test(historyDigest))fail('native-history-shape');state.nativeHistoryDigest=historyDigest;}
      if(state.phase!=='revoked')state.phase='idle';await save();
    });},
    revoke(){return serialized(async()=>{
      if(closed)fail('closed');
      const receipt=await lease.revoke({reasonDigest:sha256Value({reason:'native-host-operator-revocation',associationDigest})});
      await checkState();state.phase='revoked';await save();return receipt;
    });},
    close(){return serialized(async()=>{
      if(closed)return;closed=true;
      try{await checkState();if(state.phase==='running'){state.phase='uncertain';await save();}}
      finally{try{await lease.release();}finally{await stateLock.release();}}
    });},
  });
}
