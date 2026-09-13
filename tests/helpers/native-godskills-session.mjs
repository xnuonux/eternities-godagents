import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { nativeAdmission } from './native-host-admission.mjs';
import { nativeSkillOptions, forgeObjective } from './native-godskills-policy.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { loadPiSdk } from '../../src/host/pi-native-session.mjs';

export async function nativeSkillSession(t,{skills=nativeSkillOptions(),objective=forgeObjective,responses=[{}]}={}) {
  const f=await nativeAdmission(t);f.options.request.mission.objective=objective;
  const runtime=await loadPiSdk(process.env.GODAGENTS_PI_PACKAGE_ROOT),{sdk,ai}=runtime;
  const agentDir=join(f.root,'pi-home');await mkdir(agentDir);
  const modelRuntime=await sdk.ModelRuntime.create({authPath:join(agentDir,'auth.json'),modelsPath:null,
    modelsStorePath:join(agentDir,'models-store.json'),allowModelNetwork:false,refreshOnCreate:false});
  const contexts=[];
  modelRuntime.registerProvider('fixture',{api:'openai-completions',baseUrl:'http://127.0.0.1:1',apiKey:'fixture-only',
    models:[{id:'native-model',name:'Scripted native skill consumer',reasoning:false,input:['text'],
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:8000}],
    streamSimple(model,context){
      contexts.push(JSON.parse(JSON.stringify(context)));const next=responses.shift();assert.ok(next,'unexpected provider call');
      const content=next.content??[{type:'text',text:'completed'}];
      const message={role:'assistant',content,api:model.api,provider:model.provider,model:model.id,
        usage:{input:next.input??1,output:1,cacheRead:0,cacheWrite:0,totalTokens:(next.input??1)+1,
          cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
        stopReason:content.some(c=>c.type==='toolCall')?'toolUse':'stop',timestamp:Date.now()};
      const stream=ai.createAssistantMessageEventStream();stream.push({type:'done',reason:message.stopReason,message});stream.end(message);return stream;
    }});
  const model=modelRuntime.getModel('fixture','native-model'),sessionManager=sdk.SessionManager.create(f.cwd,join(f.root,'pi-sessions'));
  f.options.request.task.taskId=sessionManager.getSessionId();f.options.grant.sessionId=sessionManager.getSessionId();
  f.options.expectedGrantDigest=sha256Value(f.options.grant);
  if(skills!==null)f.options.godskills=skills;
  const options={runtime,bindingOptions:f.options,agentDir,modelRuntime,model,sessionManager,
    settingsManager:sdk.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}})};
  return {f,runtime,options,contexts,responses};
}

export function disclosedSkill(context) {
  const header='[Eternities native Godagent binding]\n';
  assert.equal(context.systemPrompt.split(header).length-1,1,'exactly one binding suffix per provider call');
  return JSON.parse(context.systemPrompt.slice(context.systemPrompt.indexOf(header)+header.length)).godskills;
}
