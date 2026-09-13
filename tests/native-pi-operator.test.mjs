import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, readdir, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { loadPiSdk } from '../src/host/pi-native-session.mjs';
import { runNativeOperator } from '../src/host/native-pi-operator.mjs';
import { nativeSkillOptions, forgeObjective } from './helpers/native-godskills-policy.mjs';
import { disclosedSkill } from './helpers/native-godskills-session.mjs';

const packageRoot=process.env.GODAGENTS_PI_PACKAGE_ROOT;
const nativeTest=(name,fn)=>test(name,{skip:!packageRoot&&'qualified optional Pi SDK required'},fn);
const done=[{type:'text',text:'private assistant handoff'}];
const write=(id,path,content)=>[{type:'toolCall',id,name:'write',arguments:{path,content}}];

async function setup(t,responses) {
  const f=await nativeAdmission(t), runtime=await loadPiSdk(packageRoot);
  const modelRuntime=await runtime.sdk.ModelRuntime.create({authPath:join(f.root,'test-auth.json'),modelsPath:null,
    allowModelNetwork:false,refreshOnCreate:false});
  const contexts=[];
  modelRuntime.registerProvider('fixture',{api:'openai-completions',baseUrl:'http://127.0.0.1:1',apiKey:'fixture-only',
    models:[{id:'native-model',name:'operator fixture',reasoning:false,input:['text'],
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:8000}],
    streamSimple(model,context) {
      contexts.push(JSON.parse(JSON.stringify(context)));
      let content=responses.shift();assert.ok(content,'unexpected inference');
      if(content instanceof Error)throw content;
      const errorMessage=Array.isArray(content)?undefined:content.errorMessage;
      if(errorMessage)content=content.content??[];
      const stream=runtime.ai.createAssistantMessageEventStream();
      const message={role:'assistant',content,api:model.api,provider:model.provider,model:model.id,
        usage:errorMessage?{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}:{input:3,output:2,cacheRead:1,cacheWrite:0,totalTokens:6,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
        stopReason:errorMessage?'error':content.some(x=>x.type==='toolCall')?'toolUse':'stop',...(errorMessage?{errorMessage}:{}),timestamp:Date.now()};
      stream.push(errorMessage?{type:'error',reason:'error',error:message}:{type:'done',reason:message.stopReason,message});stream.end(message);return stream;
    }});
  // Auth is the external seam; keep the real SDK, session, tools and actor validation.
  modelRuntime.checkAuth=async()=>({type:'oauth'});
  modelRuntime.isUsingSubscription=()=>true;
  const {keelAdapter,...admission}=f.options.admission;
  const config={schemaVersion:1,protocolId:'eternities-native-pi-operator-v1',piPackageRoot:packageRoot,
    authPath:join(f.root,'test-auth.json'),cwd:f.cwd,sessionRoot:join(f.root,'operator'),
    admission:{...admission,keelRoot:join(dirname(admission.transactionDir),'keels')},mission:f.options.request.mission,
    model:{provider:'fixture',id:'native-model',maxTokens:8000},
    grant:{allowedTools:['read','write','edit'],maxToolCalls:20,expiresAt:new Date(Date.now()+3600000).toISOString()},
    limits:{maxRunMs:60000}};
  const run=(command,prompt,overrides={})=>runNativeOperator({command,config,expectedConfigDigest:sha256Value(config),
    runtime,modelRuntime,prompt,...overrides});
  return {f,runtime,modelRuntime,config,contexts,responses,run};
}

nativeTest('operator launch and fresh owner resume continue one actor with real native writes',async t=>{
  const x=await setup(t,[write('op-first','first.txt','stage one'),done]);
  const first=await x.run('launch','stage one');
  if(first.status==='failed')t.diagnostic(JSON.stringify(first));
  assert.equal(first.status,'native-turn-settled');
  assert.equal(await readFile(join(x.f.cwd,'first.txt'),'utf8'),'stage one');
  assert.equal(first.state.actions.completed,1);assert.equal(first.usage.totalTokens,12);
  assert.doesNotMatch(JSON.stringify(first),/private assistant handoff|fixture-only/);
  const before=x.contexts.length;
  const status=await x.run('status');
  assert.equal(status.status,'recorded-state');assert.equal(status.state.turns,1);
  assert.equal(x.contexts.length,before,'status is inference-free');
  x.responses.push(write('op-second','second.txt','stage two'),done);
  const second=await x.run('resume','stage two');
  assert.equal(second.status,'native-turn-settled');
  assert.equal(second.state.sessionId,first.state.sessionId);
  assert.equal(second.state.associationDigest,first.state.associationDigest);
  assert.equal(second.state.turns,2);assert.equal(second.state.actions.completed,2);
  assert.equal(await readFile(join(x.f.cwd,'second.txt'),'utf8'),'stage two');
  assert.match(JSON.stringify(x.contexts[2].messages),/stage one/,'native prior history survives');
  assert.equal((await readdir(join(x.config.sessionRoot,'runs'))).length,2);
});

nativeTest('operator preflight validates optional skill roots without selecting or writing session state',async t=>{
  const x=await setup(t,[]);x.config.godskills=nativeSkillOptions();x.config.mission.objective=forgeObjective;
  const preflight=await x.run('preflight');assert.equal(preflight.godskills.status,'verified-not-selected');
  await assert.rejects(access(x.config.sessionRoot),e=>e.code==='ENOENT');assert.equal(x.contexts.length,0);
  x.config.godskills.policy.releasePin.systemReceipt.sha256='a'.repeat(64);
  x.config.godskills.expectedPolicyDigest=sha256Value(x.config.godskills.policy);
  await assert.rejects(x.run('preflight'),/native-godskills:/);assert.equal(x.contexts.length,0);
});

nativeTest('operator carries selected skill binding through launch and resume while offline status stays model-free',async t=>{
  const x=await setup(t,[done,done]);x.config.godskills=nativeSkillOptions();x.config.mission.objective=forgeObjective;
  const launched=await x.run('launch','first');assert.equal(launched.status,'native-turn-settled');
  assert.equal(disclosedSkill(x.contexts[0]).status,'bound');
  const resumed=await x.run('resume','continue');assert.equal(resumed.state.associationDigest,launched.state.associationDigest);
  assert.deepEqual(disclosedSkill(x.contexts[1]),disclosedSkill(x.contexts[0]));
  x.modelRuntime.checkAuth=async()=>{throw new Error('offline should not load auth');};
  assert.equal((await x.run('status')).status,'recorded-state');assert.equal(x.contexts.length,2);
});

nativeTest('operator rejects wrong pins and duplicate launch before extra provider work',async t=>{
  const x=await setup(t,[done]);
  await assert.rejects(x.run('launch','test',{expectedConfigDigest:'a'.repeat(64)}),/config-pin/);
  await assert.rejects(access(x.config.sessionRoot),e=>e.code==='ENOENT');
  assert.equal(x.contexts.length,0);
  await x.run('launch','test');
  await assert.rejects(x.run('launch','again'),/session-exists/);
  assert.equal(x.contexts.length,1);
});

nativeTest('operator refuses altered config and altered native transcript on resume',async t=>{
  const x=await setup(t,[done]);await x.run('launch','test');
  x.config.model.maxTokens=7000;
  await assert.rejects(x.run('resume','next'),/config-mismatch/);
  x.config.model.maxTokens=8000;
  const metadata=JSON.parse(await readFile(join(x.config.sessionRoot,'operator.json'),'utf8'));
  await appendFile(metadata.sessionFile,'\n');
  const failed=await x.run('resume','next');
  assert.equal(failed.status,'failed');assert.match(failed.category,/native-history/);
  assert.equal(x.contexts.length,1);
});

nativeTest('preflight checks subscription without inference and refuses paid-key fallback',async t=>{
  const x=await setup(t,[]);
  assert.equal((await x.run('preflight')).status,'preflight-ready');
  await assert.rejects(access(x.config.sessionRoot),e=>e.code==='ENOENT');
  x.modelRuntime.checkAuth=async()=>({type:'api_key',value:'never-print-me'});
  await assert.rejects(x.run('launch','run'),/subscription-required/);
  assert.equal(x.contexts.length,0);
});

nativeTest('provider failure is preserved once and console-safe, never automatically retried',async t=>{
  const x=await setup(t,[new Error('Bearer never-print-provider-secret')]);
  const result=await x.run('launch','private mission input');
  assert.equal(result.status,'failed');assert.equal(result.category,'native-pi:provider-failed');
  assert.equal(x.contexts.length,1);assert.doesNotMatch(JSON.stringify(result),/Bearer|never-print|private mission/);
  assert.equal(result.state.phase,'idle');
  const saved=JSON.parse(await readFile(join(result.runPath,'result.json'),'utf8'));
  assert.equal(saved.status,'failed');
});

for(const errorMessage of ['terminated','Error Code null: Internal error during token generation']) {
  nativeTest(`opt-in native recovery continues after ${errorMessage} without repeating tools`,async t=>{
    const x=await setup(t,[write('before-drop','before.txt','already done'),
      {errorMessage,content:write('partial-drop','partial.txt','must not execute')},
      write('after-drop','after.txt','recovered'),done]);
    x.config.limits.maxProviderRetries=1;const progress=[];
    const result=await x.run('launch','complete the coding work',{onProgress:e=>progress.push(e)});
    assert.equal(result.status,'native-turn-settled');assert.equal(result.state.inferences.native,4);
    assert.equal(result.state.actions.completed,2);assert.equal(result.state.actions.pending,0);
    assert.equal(await readFile(join(x.f.cwd,'before.txt'),'utf8'),'already done');
    assert.equal(await readFile(join(x.f.cwd,'after.txt'),'utf8'),'recovered');
    await assert.rejects(access(join(x.f.cwd,'partial.txt')),e=>e.code==='ENOENT');
    assert.equal(result.usage.missingUsageMessages,1);assert.equal(result.usage.totalTokens,null);
    assert.ok(result.warnings.includes('native-provider-recovered'));
    assert.deepEqual(progress.filter(e=>e.type==='provider-retry'),[{type:'provider-retry',attempt:1,maxAttempts:1}]);
    assert.equal(result.state.phase,'idle');
  });
}

nativeTest('opt-in recovery stops at its retry bound and leaves an honest failed record',async t=>{
  const x=await setup(t,[{errorMessage:'terminated'},{errorMessage:'terminated'},done]);
  x.config.limits.maxProviderRetries=1;
  const result=await x.run('launch','recover only within allowance');
  assert.equal(result.status,'failed');assert.equal(x.contexts.length,2);
  assert.equal(result.usage.missingUsageMessages,2);assert.equal(result.usage.totalTokens,null);
  assert.equal(result.state.phase,'idle');assert.equal(result.state.actions.total,0);
});

nativeTest('omitted or zero recovery allowance does not retry emitted transient errors',async t=>{
  for(const allowance of [undefined,0]) {
    const x=await setup(t,[{errorMessage:'terminated'},done]);
    if(allowance!==undefined)x.config.limits.maxProviderRetries=allowance;
    const result=await x.run('launch','one attempt only');
    assert.equal(result.status,'failed');assert.equal(x.contexts.length,1);
    assert.equal(result.usage.missingUsageMessages,1);
  }
});

nativeTest('two-retry allowance permits exactly three failed generation attempts',async t=>{
  const x=await setup(t,[{errorMessage:'terminated'},{errorMessage:'terminated'},{errorMessage:'terminated'},done]);
  x.config.limits.maxProviderRetries=2;
  const result=await x.run('launch','stop at the configured maximum');
  assert.equal(result.status,'failed');assert.equal(x.contexts.length,3);
  assert.equal(result.usage.missingUsageMessages,3);assert.equal(result.usage.totalTokens,null);
});

nativeTest('opt-in recovery never retries quota exhaustion or invalid credentials',async t=>{
  for(const errorMessage of ['insufficient_quota','401 invalid credentials']) {
    const x=await setup(t,[{errorMessage},done]);x.config.limits.maxProviderRetries=1;
    const result=await x.run('launch','do not bypass billing or authentication');
    assert.equal(result.status,'failed');assert.equal(x.contexts.length,1);
  }
});

nativeTest('operator interruption during native retry backoff prevents another model call',async t=>{
  const x=await setup(t,[{errorMessage:'terminated'},done]);x.config.limits.maxProviderRetries=1;
  const controller=new AbortController();
  const result=await x.run('launch','honor stop during recovery',{signal:controller.signal,
    onProgress:e=>{if(e.type==='provider-retry')controller.abort();}});
  assert.equal(result.status,'failed');assert.equal(result.category,'native-operator:interrupted');
  assert.equal(x.contexts.length,1);assert.equal(result.state.phase,'revoked');
});

nativeTest('operator refuses host-owned roots inside the model project before any inference',async t=>{
  const x=await setup(t,[]);x.config.sessionRoot=join(x.f.cwd,'hidden-host-state');
  await assert.rejects(x.run('launch','test'),/host-path-inside-workspace/);
  assert.equal(x.contexts.length,0);
});

nativeTest('an aborted live run is recorded and cannot silently resume revoked authority',async t=>{
  const x=await setup(t,[write('interrupt-write','before-abort.txt','effect already happened'),done]);
  const controller=new AbortController();
  const result=await x.run('launch','test',{signal:controller.signal,onProgress:()=>controller.abort()});
  assert.equal(result.status,'failed');assert.equal(result.category,'native-operator:interrupted');
  assert.equal(await readFile(join(x.f.cwd,'before-abort.txt'),'utf8'),'effect already happened');
  const before=x.contexts.length;
  const resumed=await x.run('resume','do not bypass revoke');
  assert.equal(resumed.status,'failed');assert.match(resumed.category,/revoked/);
  assert.equal(x.contexts.length,before);
});

nativeTest('real command status is offline and screens transcript content',async t=>{
  const x=await setup(t,[done]);await x.run('launch','private initial prompt');
  const {nativePiCli}=await import('../src/host/native-pi-cli.mjs');
  const configPath=join(x.f.root,'operator-config.json');await writeFile(configPath,JSON.stringify(x.config));
  let stdout='',stderr='';
  const streams={stdout:{write(value){stdout+=value;}},stderr:{write(value){stderr+=value;}}};
  assert.equal(await nativePiCli(['status','--config',configPath,'--pin',sha256Value(x.config)],streams),0);
  assert.equal(JSON.parse(stdout).state.turns,1);assert.equal(stderr,'');
  assert.doesNotMatch(stdout,/private initial|private assistant|fixture-only/);
  const before=x.contexts.length;
  assert.equal(await nativePiCli(['launch','--config',configPath,'--pin','a'.repeat(64),
    '--prompt-file',join(x.f.root,'not-present.txt')],streams),1);
  assert.equal(x.contexts.length,before);assert.match(stderr,/config-pin/);
});

nativeTest('dot-prefixed host roots are still inside the workspace and are denied',async t=>{
  const x=await setup(t,[]);x.config.sessionRoot=join(x.f.cwd,'...host-state');
  await assert.rejects(x.run('launch','test'),/host-path-inside-workspace/);
  assert.equal(x.contexts.length,0);
});

nativeTest('the run disarms abort before publishing a settled outcome',async t=>{
  const x=await setup(t,[done]);const controller=new AbortController();let firstRemoval;
  const signal={get aborted(){return controller.signal.aborted;},
    addEventListener(...args){return controller.signal.addEventListener(...args);},
    removeEventListener(...args){
      const runs=join(x.config.sessionRoot,'runs');
      firstRemoval??=!readdirSync(runs).some(id=>existsSync(join(runs,id,'result.json')));
      controller.signal.removeEventListener(...args);controller.abort();
    }};
  const result=await x.run('launch','test',{signal});
  assert.equal(result.status,'native-turn-settled');assert.equal(firstRemoval,true);
  assert.equal((await x.run('status')).state.phase,'idle');
});

nativeTest('failed initial setup preserves a useful offline diagnostic and never overwrites it',async t=>{
  const x=await setup(t,[]);const original=x.runtime.sdk.SessionManager.create;
  x.runtime.sdk.SessionManager.create=()=>{throw new Error('private injected startup failure');};
  let result;
  try{result=await x.run('launch','test');}finally{x.runtime.sdk.SessionManager.create=original;}
  assert.equal(result.status,'failed');assert.equal(result.category,'native-operator:setup-failed');
  const status=await x.run('status');assert.equal(status.status,'setup-failed');
  assert.match(status.recovery,/new sessionRoot/);assert.doesNotMatch(JSON.stringify(status),/private injected/);
  assert.equal(x.contexts.length,0);await assert.rejects(x.run('launch','again'),/session-exists/);
});
