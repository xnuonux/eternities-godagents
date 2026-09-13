import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, access, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { loadPiSdk, openPiGodagentSession } from '../src/host/pi-native-session.mjs';

const packageRoot = process.env.GODAGENTS_PI_PACKAGE_ROOT;
const nativeTest = (name, fn) => test(name, {skip: !packageRoot && 'set GODAGENTS_PI_PACKAGE_ROOT to the qualified optional SDK'}, fn);

function assistantStream(ai, model, content) {
  const stream = ai.createAssistantMessageEventStream();
  const errorMessage=Array.isArray(content)?undefined:content.errorMessage;
  const inputTokens=Array.isArray(content)?1:(content.usageInput??0);
  if(!Array.isArray(content))content=content.content??[];
  const message = {role:'assistant',content,api:model.api,provider:model.provider,model:model.id,
    usage:{input:inputTokens,output:1,cacheRead:0,cacheWrite:0,totalTokens:inputTokens+1,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
    stopReason:errorMessage?'error':content.some(c=>c.type==='toolCall')?'toolUse':'stop',
    ...(errorMessage?{errorMessage}:{}),timestamp:Date.now()};
  stream.push(errorMessage?{type:'error',reason:'error',error:message}:{type:'done',reason:message.stopReason,message});
  stream.end(message);return stream;
}
const write = (id, path, content) => ({type:'toolCall',id,name:'write',arguments:{path,content}});
const done = [{type:'text',text:'native task complete'}];

async function setup(t, responses, admissionOptions) {
  const f = await nativeAdmission(t,admissionOptions);
  const runtime = await loadPiSdk(packageRoot);
  const {sdk,ai} = runtime;
  const agentDir = join(f.root,'pi-home');await mkdir(agentDir);
  const modelRuntime = await sdk.ModelRuntime.create({authPath:join(agentDir,'auth.json'),modelsPath:null,
    modelsStorePath:join(agentDir,'models-store.json'),allowModelNetwork:false,refreshOnCreate:false});
  const contexts=[];
  modelRuntime.registerProvider('fixture', {api:'openai-completions',baseUrl:'http://127.0.0.1:1',apiKey:'fixture-not-a-real-key',
    models:[{id:'native-model',name:'Scripted integration fixture',reasoning:false,input:['text'],
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:8000}],
    streamSimple(model,context) {
      contexts.push(JSON.parse(JSON.stringify(context)));
      const response=responses.shift();
      assert.ok(response,'unexpected extra provider call');
      return assistantStream(ai,model,typeof response==='function'?response():response);
    }});
  const model=modelRuntime.getModel('fixture','native-model');assert.ok(model);
  const sessionManager=sdk.SessionManager.create(f.cwd,join(f.root,'pi-sessions'));
  const id=sessionManager.getSessionId();
  f.options.request.task.taskId=id;f.options.grant.sessionId=id;
  f.options.expectedGrantDigest=sha256Value(f.options.grant);
  const settingsManager=sdk.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}});
  const options={runtime,bindingOptions:f.options,agentDir,modelRuntime,model,sessionManager,settingsManager};
  return {f,runtime,options,contexts,responses};
}

nativeTest('real Pi writes with native tools and resumes the same admitted actor', async t=>{
  const x=await setup(t,[[write('native-1','native-proof.txt','real native write')],done]);
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  host.subscribe(event=>{if(event.type==='message_end'&&event.message.errorMessage)t.diagnostic(event.message.errorMessage);});
  await host.prompt('write the requested file using your native write tool');
  assert.ok(x.contexts.length>0,'fixture provider was called');
  assert.equal(await readFile(join(x.f.cwd,'native-proof.txt'),'utf8'),'real native write');
  const state=await host.inspect();assert.equal(state.phase,'idle');assert.equal(state.actions.length,1);
  assert.equal(state.actions[0].status,'completed');assert.equal(state.actions[0].isError,false);
  assert.match(x.contexts[0].systemPrompt,/Eternities native Godagent binding/);
  assert.match(x.contexts[0].systemPrompt,/read|coding assistant/);
  assert.ok(x.contexts[0].tools.some(tool=>tool.name==='write'));
  assert.ok(!x.contexts[0].tools.some(tool=>tool.name==='powershell'||tool.name==='bash'));
  const sessionFile=host.sessionFile;assert.ok(sessionFile);await host.close();
  x.responses.push([write('native-2','resumed.txt','same actor')],done);
  const sessionManager=x.runtime.sdk.SessionManager.open(sessionFile);
  const resumed=await openPiGodagentSession({...x.options,sessionManager,bindingOptions:{...x.f.options,resume:true}});
  x.f.dispose(()=>resumed.close());await resumed.prompt('continue with the next file');
  assert.equal(await readFile(join(x.f.cwd,'resumed.txt'),'utf8'),'same actor');
  const later=await resumed.inspect();assert.equal(later.associationDigest,state.associationDigest);
  assert.equal(later.actions.length,2);assert.equal(later.turns,2);
});

nativeTest('real Pi preserves Responses composite call IDs through native write and resume',async t=>{
  const id='call-1bc2c1b3-b46f-4e8a-a8a3-85c094687803-0|fc_806f999a-72a5-9b05-9325-ac25110d165f_0';
  const x=await setup(t,[[write(id,'composite-id.txt','provider ID survived')],done]);
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.prompt('write using the native tool');
  assert.equal(await readFile(join(x.f.cwd,'composite-id.txt'),'utf8'),'provider ID survived');
  assert.equal((await host.inspect()).actions[0].callId,id);
  const file=host.sessionFile;await host.close();
  x.responses.push(done);
  const resumed=await openPiGodagentSession({...x.options,sessionManager:x.runtime.sdk.SessionManager.open(file),
    bindingOptions:{...x.f.options,resume:true}});x.f.dispose(()=>resumed.close());
  await resumed.prompt('confirm the existing result');
  const state=await resumed.inspect();
  assert.equal(state.actions[0].callId,id);assert.equal(state.actions[0].status,'completed');
  assert.equal(state.turns,2);assert.equal(state.phase,'idle');
});

nativeTest('revoked binding rejects a prompt before any provider invocation', async t=>{
  const x=await setup(t,[]);const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.revoke();await assert.rejects(host.prompt('do something'),/revoked/);assert.equal(x.contexts.length,0);
});

nativeTest('expiry between inference and native tool execution prevents the actual write', async t=>{
  let x;
  x=await setup(t,[()=>{x.f.advance(7200000);return [write('denied-1','must-not-exist.txt','forbidden')];}]);
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await assert.rejects(host.prompt('write a file'),/expired/);
  await assert.rejects(access(join(x.f.cwd,'must-not-exist.txt')),e=>e.code==='ENOENT');
  assert.equal(x.contexts.length,1);assert.equal((await host.inspect()).actions.length,0);
});

nativeTest('real Pi retrieves large files and executes native shell only with process authority', async t=>{
  const x=await setup(t,[[{type:'toolCall',id:'read-source',name:'read',arguments:{path:'viewer.js'}}],
    [{type:'toolCall',id:'shell-proof',name:'powershell',arguments:{command:"'native-shell-proof'",timeout:10}}],done],{processAccess:true});
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  const outputs=[];host.subscribe(event=>{if(event.type==='tool_execution_end')outputs.push(event);});
  await host.prompt('read the source and run the native shell proof');
  assert.equal(outputs.length,2);assert.ok(outputs.every(e=>!e.isError));
  assert.ok(JSON.stringify(outputs[0].result).length>4096,'source is retrieved natively beyond the old objective limit');
  assert.match(JSON.stringify(outputs[1].result),/native-shell-proof/);
  assert.deepEqual((await host.inspect()).actions.map(a=>a.effect),['local-read','process-exec']);
});

nativeTest('pre-inference guard stops the next native loop call after a real completed tool', async t=>{
  const x=await setup(t,[[write('before-expiry','completed-before-expiry.txt','completed')]]);
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  host.subscribe(event=>{if(event.type==='tool_execution_end')x.f.advance(7200000);});
  await assert.rejects(host.prompt('write then continue'),/expired/);
  assert.equal(x.contexts.length,1);
  assert.equal(await readFile(join(x.f.cwd,'completed-before-expiry.txt'),'utf8'),'completed');
  assert.equal((await host.inspect()).actions[0].status,'completed');
});

nativeTest('ordinary unbound Pi remains an ordinary native session', async t=>{
  const x=await setup(t,[done]);
  const {session}=await x.runtime.sdk.createAgentSession({...x.options,cwd:x.f.cwd,tools:['read']});
  x.f.dispose(()=>session.dispose());await session.prompt('say hello');await session.waitForIdle();
  assert.equal(x.contexts.length,1);assert.doesNotMatch(x.contexts[0].systemPrompt,/Eternities native Godagent binding/);
  await assert.rejects(access(join(x.f.options.stateDirectory,'session.json')),e=>e.code==='ENOENT');
});

nativeTest('changed persisted Pi transcript is not silently adopted on resume', async t=>{
  const x=await setup(t,[done]);const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.prompt('complete');const file=host.sessionFile;await host.close();
  await appendFile(file,'\n');
  const sessionManager=x.runtime.sdk.SessionManager.open(file);
  await assert.rejects(openPiGodagentSession({...x.options,sessionManager,
    bindingOptions:{...x.f.options,resume:true}}),/native-history/);
  assert.equal(x.contexts.length,1);
});

nativeTest('history mismatch stays rejected across repeated prompts without repinning it', async t=>{
  const x=await setup(t,[done]);const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.prompt('complete');const before=await host.inspect();await appendFile(host.sessionFile,'\n');
  for(let i=0;i<2;i++)await assert.rejects(host.prompt('continue'),/native-history/);
  assert.equal((await host.inspect()).nativeHistoryDigest,before.nativeHistoryDigest);
  assert.equal(x.contexts.length,1);
});

nativeTest('native provider errors are failures, not successful product completion', async t=>{
  const x=await setup(t,[()=>{throw new Error('offline fixture provider failure');}]);
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await assert.rejects(host.prompt('complete'),/native-pi:provider-failed/);
  assert.equal(x.contexts.length,1);assert.equal((await host.inspect()).phase,'idle');
});

test('optional public Pi entrypoint imports without loading the native SDK',async()=>{
  const entry=await import('@eternities/godagents/native-pi');
  assert.equal(entry.loadPiSdk,loadPiSdk);assert.equal(entry.openPiGodagentSession,openPiGodagentSession);
  assert.equal(entry.nativeToolEffects.powershell,'process-exec');
});

nativeTest('a throwing provider stream is not authority denial and a later prompt can recover',async t=>{
  const x=await setup(t,[done]);
  const original=x.options.modelRuntime.streamSimple.bind(x.options.modelRuntime);let first=true;
  x.options.modelRuntime.streamSimple=(...args)=>{
    if(first){first=false;throw new Error('fixture stream boundary exception');}
    return original(...args);
  };
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  const errors=[];host.subscribe(event=>{if(event.type==='message_end'&&event.message.errorMessage)errors.push(event.message.errorMessage);});
  await assert.rejects(host.prompt('first attempt'),/native-pi:provider-failed/);
  assert.ok(errors.length);assert.ok(errors.every(message=>!message.includes('authority-check-failed')));
  await host.prompt('operator-requested new attempt');assert.equal(x.contexts.length,1);
});

nativeTest('Pi automatic compaction remains native and its inference is distinguished',async t=>{
  const x=await setup(t,[done,{content:done,usageInput:1000},[{type:'text',text:'# Goal\nRetain the native task and actor.\n# Progress\nThe first turn completed.'}]]);
  x.options.settingsManager=x.runtime.sdk.SettingsManager.inMemory({retry:{enabled:false},
    compaction:{enabled:true,reserveTokens:127900,keepRecentTokens:16}});
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  const events=[];host.subscribe(event=>{if(event.type.startsWith('compaction_'))events.push(event);});
  await host.prompt('establish the first completed turn');
  await host.prompt('retain the purpose and completed task. '.repeat(80));
  assert.ok(events.some(e=>e.type==='compaction_end'&&e.result),'native compaction completed: '+JSON.stringify(events));
  assert.equal(x.contexts.length,3);
  assert.deepEqual((await host.inspect()).inferences,{native:2,compaction:1});
});

nativeTest('a failed automatic summary reports a warning and does not revoke the actor',async t=>{
  const summary=[{type:'text',text:'# Goal\nKeep the actor and task.\n# Progress\nTwo turns completed.'}];
  const x=await setup(t,[done,{content:done,usageInput:1000},summary,done]);
  x.options.settingsManager=x.runtime.sdk.SettingsManager.inMemory({retry:{enabled:false},
    compaction:{enabled:true,reserveTokens:127900,keepRecentTokens:16}});
  const original=x.options.modelRuntime.streamSimple.bind(x.options.modelRuntime);let calls=0;
  x.options.modelRuntime.streamSimple=(...args)=>{
    calls++;if(calls===3)throw new Error('fixture summary provider exception');return original(...args);
  };
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.prompt('first completed turn');
  const second=await host.prompt('retain the purpose and completed task. '.repeat(80));
  assert.deepEqual(second.warnings,['native-compaction-failed']);assert.equal(second.state.phase,'idle');
  const recovered=await host.prompt('continue after the temporary provider failure');
  assert.deepEqual(recovered.warnings,[]);assert.equal(calls,5);
  assert.deepEqual(recovered.state.inferences,{native:3,compaction:2});
});

nativeTest('native automatic retry success is not reported as a failed prompt',async t=>{
  const x=await setup(t,[{errorMessage:'503 service unavailable'},done]);
  x.options.settingsManager=x.runtime.sdk.SettingsManager.inMemory({retry:{enabled:true,maxRetries:1,baseDelayMs:1},compaction:{enabled:false}});
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  const result=await host.prompt('recover through the native retry');
  assert.equal(result.status,'native-turn-settled');assert.equal(x.contexts.length,2);
  assert.equal(result.state.inferences.native,2);
});

nativeTest('exhausted native retries fail but do not revoke later operator-requested work',async t=>{
  const x=await setup(t,[{errorMessage:'503 service unavailable'},{errorMessage:'503 service unavailable'},done]);
  x.options.settingsManager=x.runtime.sdk.SettingsManager.inMemory({retry:{enabled:true,maxRetries:1,baseDelayMs:1},compaction:{enabled:false}});
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await assert.rejects(host.prompt('retry budget will exhaust'),/native-pi:provider-failed/);
  assert.equal(x.contexts.length,2);assert.equal((await host.inspect()).phase,'idle');
  await host.prompt('new operator-requested work');assert.equal(x.contexts.length,3);
});
