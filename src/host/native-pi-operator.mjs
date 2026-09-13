import { mkdir, readFile, writeFile, realpath, stat, access } from 'node:fs/promises';
import { join, dirname, resolve, relative, isAbsolute, parse, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256Value, sha256Text } from '../core/digest.mjs';
import { compileCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { replaceFileAtomically } from '../state/atomic-publication.mjs';
import { loadPiSdk, openPiGodagentSession } from './pi-native-session.mjs';
import { nativeToolEffects } from './native-host-binding.mjs';
import { validateNativeOperatorConfig } from './native-pi-operator-config.mjs';
import { summarizeNativeState, createNativeUsageCollector } from './native-session-report.mjs';
import { readNativeRunHistory } from './native-run-history.mjs';
import { preflightNativeGodskills } from '../skills/native-godskills-binding.mjs';

const fail=code=>{throw new Error(`native-operator:${code}`);};
const json=value=>JSON.stringify(value,null,2)+'\n';
export function nativeOperatorError(error) {
  return /^(native-operator|native-pi|native-host|native-session-report|native-run-history|native-godskills):[a-z0-9-]{1,80}$/.test(error?.message??'')
    ?error.message:'native-operator:operation-failed';
}
async function readJson(path,limit=1024*1024) {
  if((await stat(path)).size>limit)fail('record-too-large');
  try{return JSON.parse(await readFile(path,'utf8'));}catch{fail('record-invalid');}
}
async function resolvedTarget(path) {
  try{return await realpath(path);}catch(error){
    if(error.code!=='ENOENT')throw error;
    if(dirname(path)===path)throw error;
    return join(await resolvedTarget(dirname(path)),relative(dirname(path),path));
  }
}
async function assertHostPaths(config,configPath) {
  const cwd=await realpath(config.cwd);
  if(!(await stat(cwd)).isDirectory())fail('workspace');
  const paths=[config.sessionRoot,config.authPath,config.piPackageRoot,
    ...Object.entries(config.admission).filter(([key])=>key.endsWith('Path')||key.endsWith('Dir')||key==='keelRoot').map(([,value])=>value),
    ...(configPath?[configPath]:[])];
  for(const path of paths) {
    const target=await resolvedTarget(path),rel=relative(cwd,target);
    if(rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)))fail('host-path-inside-workspace');
  }
  if(resolve(config.sessionRoot)===parse(config.sessionRoot).root)fail('session-root');
}
const admissionFor=config=>{
  const {keelRoot,...admission}=config.admission;
  return {...admission,keelAdapter:createLocalKeelBackend({root:keelRoot})};
};
const requestFor=(config,sessionId)=>({schemaVersion:1,
  task:{taskId:sessionId,hostAdapterId:'pi-sdk-v1',revocationEpoch:0},
  mission:config.mission,maxProjectionBytes:32768});
async function compileHost(config,sessionId) {
  const admission=admissionFor(config),request=requestFor(config,sessionId);
  const candidate=await compileCortexBindingCandidate({admission,request});
  const capabilities={'local-read':'filesystem.read','local-write':'filesystem.write','process-exec':'process.exec'};
  for(const tool of config.grant.allowedTools) {
    const effect=nativeToolEffects[tool];
    if(!candidate.fullEnvelope.identity.constitution.allowedEffects.includes(effect)
      ||!candidate.fullEnvelope.authority.realmCapabilities.includes(capabilities[effect]))fail('effect-ceiling');
  }
  if(Date.parse(config.grant.expiresAt)<=Date.now())fail('grant-expired');
  return {admission,request,candidate};
}
async function metadataFor(config,configDigest) {
  const metadata=await readJson(join(config.sessionRoot,'operator.json'));
  const {metadataDigest,...body}=metadata;
  if(metadata.schemaVersion!==1||metadata.protocolId!=='eternities-native-pi-operator-session-v1'
    ||sha256Value(body)!==metadataDigest)fail('metadata-integrity');
  if(metadata.configDigest!==configDigest)fail('config-mismatch');
  if(typeof metadata.sessionId!=='string'||typeof metadata.sessionFile!=='string'
    ||!isAbsolute(metadata.sessionFile))fail('metadata-integrity');
  const rel=relative(join(config.sessionRoot,'pi-sessions'),metadata.sessionFile);
  if(rel===''||rel.startsWith('..')||isAbsolute(rel))fail('metadata-integrity');
  if(metadata.request.task.taskId!==metadata.sessionId||sha256Value(metadata.request)!==sha256Value(requestFor(config,metadata.sessionId)))fail('metadata-integrity');
  return metadata;
}
async function setupFailure(config,configDigest) {
  let record;
  try{record=await readJson(join(config.sessionRoot,'setup-failure.json'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  const {recordDigest,...body}=record;
  if(record.protocolId!=='eternities-native-operator-setup-failure-v1'||record.schemaVersion!==1
    ||record.configDigest!==configDigest||sha256Value(body)!==recordDigest)fail('setup-record-integrity');
  return {status:'setup-failed',category:'native-operator:setup-failed',recordDigest,
    recovery:'preserve this directory; correct the setup and choose a new sessionRoot with a newly reviewed config pin'};
}

// Runtime injection is for a trusted embedding host, not a model-facing CLI option.
export async function runNativeOperator({command,config:inputConfig,expectedConfigDigest,prompt,
  configPath,runtime,modelRuntime,signal,onProgress}={}) {
  if(!/^[a-f0-9]{64}$/.test(expectedConfigDigest??'')||sha256Value(inputConfig)!==expectedConfigDigest)fail('config-pin');
  const config=validateNativeOperatorConfig(structuredClone(inputConfig));
  if(!['preflight','launch','resume','status','history'].includes(command))fail('command');
  await assertHostPaths(config,configPath);
  if(command==='status'||command==='history') {
    const failedSetup=await setupFailure(config,expectedConfigDigest);if(failedSetup)return failedSetup;
    const metadata=await metadataFor(config,expectedConfigDigest);
    const state=await readJson(join(config.sessionRoot,'native-state/session.json'),8*1024*1024);
    if(state.association?.sessionId!==metadata.sessionId||state.association?.grantDigest!==sha256Value(metadata.grant))fail('metadata-integrity');
    if(command==='status')return {status:'recorded-state',state:summarizeNativeState(state),
      authority:'offline snapshot only; resume revalidates actor, lease, expiry and native history'};
    summarizeNativeState(state);
    return readNativeRunHistory({sessionRoot:config.sessionRoot,expectedSessionId:metadata.sessionId,
      expectedConfigDigest});
  }
  if(command!=='preflight'&&(typeof prompt!=='string'||!prompt.trim()||Buffer.byteLength(prompt,'utf8')>128*1024))fail('prompt');
  let metadata;
  if(command==='resume')metadata=await metadataFor(config,expectedConfigDigest);
  if(command==='launch') {
    try{await access(config.sessionRoot);fail('session-exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const compiled=await compileHost(config,metadata?.sessionId??'native-operator-preflight');
  const skillPreflight=config.godskills?await preflightNativeGodskills({options:config.godskills,
    candidate:compiled.candidate,request:compiled.request,grant:{...config.grant,cwd:config.cwd},
    effectCeiling:[...new Set(config.grant.allowedTools.map(tool=>nativeToolEffects[tool]))]}):null;
  runtime??=await loadPiSdk(config.piPackageRoot);
  modelRuntime??=await runtime.sdk.ModelRuntime.create({authPath:config.authPath,modelsPath:null,
    allowModelNetwork:false,refreshOnCreate:true});
  const auth=await modelRuntime.checkAuth(config.model.provider);
  if(auth?.type!=='oauth'||!modelRuntime.isUsingSubscription(config.model.provider))fail('subscription-required');
  const catalogModel=modelRuntime.getModel(config.model.provider,config.model.id);
  if(!catalogModel)fail('model-unavailable');
  if(config.model.maxTokens>catalogModel.maxTokens)fail('model-output-limit');
  const model={...catalogModel,maxTokens:config.model.maxTokens};
  if(command==='preflight')return {status:'preflight-ready',sdkVersion:runtime.version,
    ...(skillPreflight?{godskills:{status:'verified-not-selected',releaseDigest:skillPreflight.verification.release.releaseDigest,
      policyDigest:config.godskills.expectedPolicyDigest}}:{}),
    model:{provider:model.provider,id:model.id,contextWindow:model.contextWindow,maxTokens:model.maxTokens},
    authentication:'oauth-subscription',instanceId:config.admission.instanceId,
    allowedTools:config.grant.allowedTools,expiresAt:config.grant.expiresAt,
    boundary:'OS-user native tools; not a sandbox; no inference performed'};
  if(signal?.aborted)fail('interrupted');
  if(command==='launch') {
    try{await mkdir(config.sessionRoot);}catch(error){if(error.code==='EEXIST')fail('session-exists');throw error;}
  }
  let lock,host,timer,abortListener,abortArmed=false,interrupted=false,runPath,finalText='',unsubscribe;
  const usage=createNativeUsageCollector(),startedAt=new Date().toISOString();
  const save=(name,value)=>replaceFileAtomically({destinationPath:join(runPath,name),content:json(value)});
  const disarm=()=>{
    abortArmed=false;clearTimeout(timer);
    if(abortListener){signal?.removeEventListener('abort',abortListener);abortListener=undefined;}
  };
  try {
    lock=await acquireFileLock({lockPath:join(config.sessionRoot,'operator.lock')});
    // Re-read under the lock, so two owners cannot adopt different snapshots.
    if(command==='resume')metadata=await metadataFor(config,expectedConfigDigest);
    const sessions=join(config.sessionRoot,'pi-sessions');
    if(command==='resume')await access(metadata.sessionFile);
    const sessionManager=command==='launch'?runtime.sdk.SessionManager.create(config.cwd,sessions)
      :runtime.sdk.SessionManager.open(metadata.sessionFile);
    if(command==='launch') {
      const sessionId=sessionManager.getSessionId(),request=requestFor(config,sessionId);
      const candidate=await compileCortexBindingCandidate({admission:compiled.admission,request});
      const grant={schemaVersion:1,protocolId:'eternities-native-host-grant-v1',
        instanceId:config.admission.instanceId,identityDigest:candidate.fullEnvelope.sectionDigests.identity,
        realmContractDigest:candidate.fullEnvelope.authority.realmContractDigest,sessionId,cwd:config.cwd,
        model:{provider:model.provider,id:model.id},...config.grant};
      const body={schemaVersion:1,protocolId:'eternities-native-pi-operator-session-v1',configDigest:expectedConfigDigest,
        sessionId,sessionFile:sessionManager.getSessionFile(),request,grant};
      metadata={...body,metadataDigest:sha256Value(body)};
      await writeFile(join(config.sessionRoot,'operator.json'),json(metadata),{flag:'wx'});
    }
    runPath=join(config.sessionRoot,'runs',randomUUID());await mkdir(runPath,{recursive:true});
    await save('started.json',{schemaVersion:1,command,startedAt,configDigest:expectedConfigDigest,
      sessionId:metadata.sessionId,promptDigest:sha256Text(prompt)});
    const admissionRoot=dirname(config.admission.transactionDir);
    host=await openPiGodagentSession({runtime,modelRuntime,model,sessionManager,
      agentDir:join(config.sessionRoot,'pi-agent'),
      settingsManager:runtime.sdk.SettingsManager.inMemory({retry:{enabled:false,maxRetries:0,
        provider:{maxRetries:0,timeoutMs:Math.min(180000,config.limits.maxRunMs)}},compaction:{enabled:true}}),
      bindingOptions:{admission:compiled.admission,request:metadata.request,grant:metadata.grant,
        expectedGrantDigest:sha256Value(metadata.grant),stateDirectory:join(config.sessionRoot,'native-state'),
        registryRoot:join(admissionRoot,'native-bindings'),instanceRegistryRoot:join(admissionRoot,'native-instances'),
        resume:command==='resume',...(config.godskills?{godskills:config.godskills}:{})}});
    unsubscribe=host.subscribe(event=>{
      usage.record(event);
      if(event.type==='message_end'&&event.message?.role==='assistant') {
        finalText=(event.message.content??[]).filter(item=>item.type==='text').map(item=>item.text).join('\n');
      }
      if(event.type==='tool_execution_end')onProgress?.({type:'tool-completed',toolName:
        Object.hasOwn(nativeToolEffects,event.toolName)?event.toolName:'unknown',isError:!!event.isError});
    });
    abortArmed=true;
    const abort=()=>{if(!abortArmed)return;interrupted=true;host.revoke().catch(()=>{});};
    abortListener=abort;signal?.addEventListener('abort',abortListener,{once:true});
    timer=setTimeout(abort,Math.min(config.limits.maxRunMs,Math.max(1,Date.parse(config.grant.expiresAt)-Date.now())));
    if(signal?.aborted)abort();
    let settled;
    try{settled=await host.prompt(prompt);}finally{disarm();}
    if(interrupted)fail('interrupted');
    const result={status:settled.status,startedAt,finishedAt:new Date().toISOString(),runPath,
      usage:usage.snapshot(),state:summarizeNativeState(settled.state),warnings:settled.warnings};
    await save('result.json',result);return result;
  } catch(error) {
    if(!runPath) {
      if(command!=='launch')throw error;
      const body={schemaVersion:1,protocolId:'eternities-native-operator-setup-failure-v1',
        configDigest:expectedConfigDigest,startedAt,finishedAt:new Date().toISOString(),
        errorDigest:sha256Text(String(error))};
      const record={...body,recordDigest:sha256Value(body)};
      await writeFile(join(config.sessionRoot,'setup-failure.json'),json(record),{flag:'wx'});
      return {status:'failed',category:'native-operator:setup-failed',recordDigest:record.recordDigest};
    }
    let state=null;
    try{if(host)state=summarizeNativeState(await host.inspect());}catch{/* uncertain state is not fabricated */}
    const result={status:'failed',category:interrupted?'native-operator:interrupted':nativeOperatorError(error),
      errorDigest:sha256Text(String(error)),startedAt,finishedAt:new Date().toISOString(),runPath,state,usage:usage.snapshot()};
    await save('result.json',result);return result;
  } finally {
    disarm();unsubscribe?.();
    try{if(runPath)await writeFile(join(runPath,'response.md'),finalText,{flag:'wx'});}
    finally{try{await host?.close();}finally{await lock?.release();}}
  }
}
