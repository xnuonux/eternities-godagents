import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { loadPiSdk } from '../src/host/pi-native-session.mjs';
import { runNativeOperator } from '../src/host/native-pi-operator.mjs';
import { captureNativeReviewSnapshot } from '../src/host/native-review-snapshot.mjs';
import { nativePiCli } from '../src/host/native-pi-cli.mjs';
const packageRoot=process.env.GODAGENTS_PI_PACKAGE_ROOT;
const nativeTest=(name,fn)=>test(name,{skip:!packageRoot&&'qualified optional Pi SDK required'},fn);
const done=[{type:'text',text:'Review findings: check calendar validation.'}];
const read=path=>[{type:'toolCall',id:'read-1',name:'read',arguments:{path}}];

async function setup(t,responses,{catalogMaxTokens=128}={}) {
  const f=await nativeAdmission(t),runtime=await loadPiSdk(packageRoot),queue=[done,...responses],contexts=[],dispatches=[];
  const modelRuntime=await runtime.sdk.ModelRuntime.create({authPath:join(f.root,'auth.json'),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});
  modelRuntime.registerProvider('fixture',{api:'openai-completions',baseUrl:'http://127.0.0.1:1',apiKey:'fixture-only',
    models:[{id:'native-model',name:'review fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:catalogMaxTokens}],
    async streamSimple(model,context,options){
      dispatches.push({modelMaxTokens:model.maxTokens,requestMaxTokens:options?.maxTokens??null});
      contexts.push(JSON.parse(JSON.stringify(context)));
      let next=queue.shift();if(typeof next==='function')next=await next();assert.ok(next,'unexpected inference');
      const error=next.errorMessage,content=error?[]:(next.content??next),stream=runtime.ai.createAssistantMessageEventStream();
      const usage=next.usage??(error?{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0}:{input:3,output:2,cacheRead:9,cacheWrite:0,totalTokens:14});
      const message={role:'assistant',content,api:model.api,provider:model.provider,model:model.id,usage:{...usage,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:error?'error':content.some(x=>x.type==='toolCall')?'toolUse':'stop',...(error?{errorMessage:error}:{}),timestamp:Date.now()};
      stream.push(error?{type:'error',reason:'error',error:message}:{type:'done',reason:message.stopReason,message});stream.end(message);return stream;
    }});
  modelRuntime.checkAuth=async()=>({type:'oauth'});modelRuntime.isUsingSubscription=()=>true;
  const {keelAdapter,...admission}=f.options.admission;
  const config={schemaVersion:1,protocolId:'eternities-native-pi-operator-v1',piPackageRoot:packageRoot,authPath:join(f.root,'auth.json'),cwd:f.cwd,sessionRoot:join(f.root,'source-session'),
    admission:{...admission,keelRoot:join(dirname(admission.transactionDir),'keels')},mission:f.options.request.mission,
    model:{provider:'fixture',id:'native-model',maxTokens:128},grant:{allowedTools:['read','write'],maxToolCalls:10,expiresAt:new Date(Date.now()+60000).toISOString()},limits:{maxRunMs:30000,maxProviderRetries:0}};
  await writeFile(join(f.cwd,'subject.mjs'),'export const original = 42;\n');
  const source=await runNativeOperator({command:'launch',config,expectedConfigDigest:sha256Value(config),runtime,modelRuntime,prompt:'source attempt'});
  assert.equal(source.status,'native-turn-settled');
  const snapshotPath=join(f.root,'snapshot.json');
  const snapshot=await captureNativeReviewSnapshot({sourceRoot:f.cwd,files:['subject.mjs'],sourceRun:{sessionRoot:config.sessionRoot,sessionId:source.state.sessionId,configDigest:sha256Value(config),runId:basename(source.runPath)},destinationPath:snapshotPath});
  config.sessionRoot=join(f.root,'review-session');config.grant.allowedTools=['read'];
  config.review={snapshotPath,snapshotDigest:snapshot.snapshotDigest,maxCompletionTokens:1024};
  const run=(overrides={})=>runNativeOperator({command:'review',config,expectedConfigDigest:sha256Value(config),runtime,modelRuntime,prompt:'review this exact subject',...overrides});
  return {f,runtime,modelRuntime,config,contexts,dispatches,queue,run};
}

nativeTest('review response maximum survives a larger provider catalog limit',async t=>{
  const x=await setup(t,[done],{catalogMaxTokens:4096});
  const result=await x.run();assert.equal(result.status,'native-turn-settled');
  assert.equal(x.dispatches[1].modelMaxTokens,128,JSON.stringify(x.dispatches));
  assert.equal(x.dispatches[1].requestMaxTokens,128);
});

nativeTest('review output overrun stops tools and further inference while retaining the reported usage',async t=>{
  const x=await setup(t,[{content:read('subject.mjs'),usage:{input:3,output:129,reasoning:100,cacheRead:0,cacheWrite:0,totalTokens:132}},done]);
  const result=await x.run();assert.equal(result.status,'failed');
  assert.equal(result.category,'native-operator:review-completion-overrun');
  assert.equal(x.contexts.length,2);assert.equal(result.state.actions.total,0);
  assert.equal(result.usage.outputTokens,129);assert.equal(result.review.reservedCompletionTokens,128);
  x.modelRuntime.checkAuth=async()=>{throw new Error('no auth on failed review replay');};
  assert.deepEqual(await x.run(),result);
});

nativeTest('review final output overrun is not returned as a successful review',async t=>{
  const x=await setup(t,[{content:done,usage:{input:3,output:129,cacheRead:0,cacheWrite:0,totalTokens:132}}]);
  const result=await x.run();assert.equal(result.status,'failed');
  assert.equal(result.category,'native-operator:review-completion-overrun');
  assert.equal(result.usage.outputTokens,129);assert.match(await readFile(join(result.runPath,'response.md'),'utf8'),/Review findings/);
});

nativeTest('successful review response with unknown output usage cannot continue',async t=>{
  const x=await setup(t,[{content:read('subject.mjs'),usage:{input:3,output:null,cacheRead:0,cacheWrite:0,totalTokens:3}},done]);
  const result=await x.run();assert.equal(result.status,'failed');
  assert.equal(result.category,'native-operator:review-usage-unknown');
  assert.equal(result.usage.outputTokens,null);assert.equal(result.state.actions.total,0);assert.equal(x.contexts.length,2);
});

nativeTest('actual native review uses snapshot read capability and preserves unsplit usage',async t=>{
  const x=await setup(t,[read('subject.mjs'),done]);
  await writeFile(join(x.f.cwd,'subject.mjs'),'live file changed');
  const result=await x.run();assert.equal(result.status,'native-turn-settled');
  assert.equal(result.review.kind,'host-review');assert.equal(result.review.snapshotDigest,x.config.review.snapshotDigest);
  assert.deepEqual(x.contexts[1].tools.map(x=>x.name),['read']);
  assert.match(JSON.stringify(x.contexts[2].messages),/export const original = 42/);
  assert.doesNotMatch(JSON.stringify(x.contexts[2].messages),/live file changed/);
  assert.equal(result.usage.inputTokens,6);assert.equal(result.usage.cacheReadTokens,18);
  assert.equal(result.usage.outputTokens,4);assert.equal(Object.hasOwn(result.usage,'reasoningTokens'),false);
  assert.equal(await readFile(join(x.f.cwd,'subject.mjs'),'utf8'),'live file changed');
});

nativeTest('review read cannot expose a filesystem secret outside the captured manifest',async t=>{
  const x=await setup(t,[read('../secret.txt'),done]);await writeFile(join(x.f.root,'secret.txt'),'SENSITIVE-OUTSIDE-BYTES');
  const result=await x.run();assert.equal(result.state.actions.failed,1);
  assert.doesNotMatch(JSON.stringify(x.contexts),/SENSITIVE-OUTSIDE-BYTES/);
  assert.match(JSON.stringify(x.contexts[2].messages),/review-path/);
});

nativeTest('review profile rejects mutation tools and public launch/resume bypass before inference',async t=>{
  const x=await setup(t,[done]);const before=x.contexts.length;
  for(const command of ['launch','resume'])await assert.rejects(x.run({command}),/review-command/);
  x.config.grant.allowedTools.push('write');await assert.rejects(x.run(),/review-tools/);
  assert.equal(x.contexts.length,before);await assert.rejects(access(x.config.sessionRoot),e=>e.code==='ENOENT');
});

nativeTest('review completion reservations stop an additional inference and retain unknown failure usage',async t=>{
  const x=await setup(t,[read('subject.mjs'),done]);x.config.review.maxCompletionTokens=128;
  const result=await x.run();assert.equal(result.status,'failed');
  assert.match(result.category,/review-completion-budget/);assert.equal(x.contexts.length,2);
  assert.equal(result.usage.totalTokens,null);assert.equal(result.usage.missingUsageMessages,1);
  assert.equal(result.review.reservedCompletionTokens,128);
});

nativeTest('exact review repetition and actual CLI return the recorded result without auth or inference',async t=>{
  const x=await setup(t,[done]),first=await x.run(),before=x.contexts.length;
  x.modelRuntime.checkAuth=async()=>{throw new Error('must stay offline');};
  assert.deepEqual(await x.run(),first);assert.equal(x.contexts.length,before);
  await assert.rejects(x.run({prompt:'different review'}),/review-dispatch-mismatch/);
  const configPath=join(x.f.root,'review-config.json'),promptPath=join(x.f.root,'prompt.txt');
  await writeFile(configPath,JSON.stringify(x.config));await writeFile(promptPath,'review this exact subject');
  let output='',error='';
  assert.equal(await nativePiCli(['review','--config',configPath,'--pin',sha256Value(x.config),'--prompt-file',promptPath],{stdout:{write:s=>{output+=s;}},stderr:{write:s=>{error+=s;}}}),0);
  assert.deepEqual(JSON.parse(output),first);assert.equal(error,'');
});

nativeTest('pending publication recovers the exact terminal native result without a second launch',async t=>{
  const x=await setup(t,[done]),first=await x.run(),recordPath=x.config.sessionRoot+'.review.json';
  const record=JSON.parse(await readFile(recordPath,'utf8'));
  const {recordDigest,result,completedAt,...pending}=record;pending.status='pending';
  await writeFile(recordPath,JSON.stringify({...pending,recordDigest:sha256Value(pending)}));
  x.modelRuntime.checkAuth=async()=>{throw new Error('no auth during recovery');};
  const recovered=await x.run();assert.equal(recovered.status,first.status);
  assert.equal(recovered.runPath,first.runPath);assert.equal(x.contexts.length,2);
});

nativeTest('pending dispatch without terminal evidence is uncertain and never automatically replayed',async t=>{
  const x=await setup(t,[done]);await x.run();const recordPath=x.config.sessionRoot+'.review.json';
  const {recordDigest,result,completedAt,...pending}=JSON.parse(await readFile(recordPath,'utf8'));pending.status='pending';
  await writeFile(recordPath,JSON.stringify({...pending,recordDigest:sha256Value(pending)}));
  await rm(x.config.sessionRoot,{recursive:true,force:true});
  const uncertain=await x.run();assert.equal(uncertain.status,'review-uncertain');assert.equal(x.contexts.length,2);
  const configPath=join(x.f.root,'config.json'),promptPath=join(x.f.root,'request.txt');
  await writeFile(configPath,JSON.stringify(x.config));await writeFile(promptPath,'review this exact subject');
  let output='';
  assert.equal(await nativePiCli(['review','--config',configPath,'--pin',sha256Value(x.config),'--prompt-file',promptPath],
    {stdout:{write:value=>{output+=value;}},stderr:{write:()=>{}}}),2,'uncertain is not a successful review exit');
  assert.equal(JSON.parse(output).status,'review-uncertain');
});

nativeTest('review snapshot drift refuses inference',async t=>{
  const x=await setup(t,[done]);await writeFile(x.config.review.snapshotPath,'{}');
  await assert.rejects(x.run(),/review-snapshot/);assert.equal(x.contexts.length,1);
});

nativeTest('review preflight verifies the snapshot before provider/auth access',async t=>{
  const x=await setup(t,[done]);await writeFile(x.config.review.snapshotPath,'{}');
  x.modelRuntime.checkAuth=async()=>{throw new Error('snapshot must reject before auth');};
  await assert.rejects(x.run({command:'preflight'}),/review-snapshot/);assert.equal(x.contexts.length,1);
});

nativeTest('review deadline includes authentication setup and never retries an uncertain launch',async t=>{
  const x=await setup(t,[done]);x.config.limits.maxRunMs=1000;
  x.modelRuntime.checkAuth=async()=>{await new Promise(resolve=>setTimeout(resolve,1100));return {type:'oauth'};};
  await assert.rejects(x.run(),/interrupted|review-deadline/);assert.equal(x.contexts.length,1);
  assert.equal((await x.run()).status,'review-uncertain');assert.equal(x.contexts.length,1);
});

nativeTest('concurrent review requests cannot dispatch a second inference',async t=>{
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),pending=new Promise(resolve=>{release=resolve;});
  const x=await setup(t,[async()=>{entered();await pending;return done;}]);
  const first=x.run();await started;
  try{await assert.rejects(x.run(),/locked/);assert.equal(x.contexts.length,2);}
  finally{release();}
  assert.equal((await first).status,'native-turn-settled');
});

nativeTest('completed review rejects result and response tampering rather than returning stale approval',async t=>{
  const x=await setup(t,[done]),first=await x.run();
  await writeFile(join(first.runPath,'response.md'),'tampered verdict');
  await assert.rejects(x.run(),/review-record/);assert.equal(x.contexts.length,2);
});

nativeTest('completed review rejects rehashed missing result fields',async t=>{
  const x=await setup(t,[done]);await x.run();const path=x.config.sessionRoot+'.review.json';
  const {recordDigest,...record}=JSON.parse(await readFile(path,'utf8'));record.result=null;
  await writeFile(path,JSON.stringify({...record,recordDigest:sha256Value(record)}));
  await assert.rejects(x.run(),/review-record/);assert.equal(x.contexts.length,2);
});
