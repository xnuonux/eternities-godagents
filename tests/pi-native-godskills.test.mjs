import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openPiGodagentSession } from '../src/host/pi-native-session.mjs';
import { nativeSkillSession, disclosedSkill } from './helpers/native-godskills-session.mjs';
import { nativeSkillOptions } from './helpers/native-godskills-policy.mjs';
import { nativeSkillReleaseCopy } from './helpers/native-godskills-release-copy.mjs';
import { appendFileSync } from 'node:fs';
import { sha256Value } from '../src/core/digest.mjs';
const nativeTest=(name,fn)=>test(name,{skip:!process.env.GODAGENTS_PI_PACKAGE_ROOT&&'optional Pi SDK required'},fn);

for(const mode of ['native','guardrail','method','review'])nativeTest(`real Pi receives exact ${mode} disclosure from the certified local binder`,async t=>{
  const skills=nativeSkillOptions({reviewAvailable:mode==='review',explicitMethodRequests:mode==='method'?['eternities-forge']:[]});
  const task=mode==='native'?{objective:'appraise whether this experiment supports its scientific claim'}:
    mode==='review'?{objective:'direct a consequential visual identity across several design layers'}:{};
  const x=await nativeSkillSession(t,{skills,...task});const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.prompt('carry out the admitted mission');
  const skill=disclosedSkill(x.contexts[0]);assert.equal(skill.status,'bound');
  assert.deepEqual(skill.package.selectedCapabilities,[mode==='native'?'eternities-athena':mode==='review'?'eternities-muse':'eternities-forge']);
  assert.equal(skill.package.activation.decisions[0].mode,mode);
  assert.ok(x.contexts[0].tools.some(tool=>tool.name==='write'));
  assert.ok(!x.contexts[0].tools.some(tool=>tool.name==='bash'));
  if(mode==='review'){assert.deepEqual(skill.package.selectedPackages,[]);assert.equal(skill.reviewExecution,'scheduled-only');}
  else if(mode==='native'){assert.deepEqual(skill.package.selectedPackages,[]);assert.equal(skill.reviewExecution,'not-scheduled');}
  else if(mode==='method')assert.match(skill.package.selectedPackages[0].entrypoint,/Forge/);
  else assert.equal(skill.package.selectedPackages[0].entrypoint,undefined);
});

nativeTest('compaction and resumed prompts retain one immutable selection and reject removal',async t=>{
  const x=await nativeSkillSession(t,{responses:[{},{input:1000},{content:[{type:'text',text:'# Goal\nRetain task.\n# Progress\nTwo turns complete.'}]}]});
  x.options.settingsManager=x.runtime.sdk.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:true,reserveTokens:127900,keepRecentTokens:16}});
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.prompt('first turn');await host.prompt('retain purpose and completed task. '.repeat(80));
  assert.deepEqual((await host.inspect()).inferences,{native:2,compaction:1});
  const first=disclosedSkill(x.contexts[0]);assert.equal(first.status,'bound');
  for(const context of x.contexts)assert.deepEqual(disclosedSkill(context),first);
  const file=host.sessionFile,state=await host.inspect();await host.close();
  const bindingOptions={...x.f.options,resume:true};delete bindingOptions.godskills;
  await assert.rejects(openPiGodagentSession({...x.options,bindingOptions,sessionManager:x.runtime.sdk.SessionManager.open(file)}),/association-mismatch/);
  x.responses.push({});
  const reopened=await openPiGodagentSession({...x.options,settingsManager:x.runtime.sdk.SettingsManager.inMemory({compaction:{enabled:false}}),
    bindingOptions:{...x.f.options,resume:true},sessionManager:x.runtime.sdk.SessionManager.open(file)});x.f.dispose(()=>reopened.close());
  await reopened.prompt('continue');assert.equal((await reopened.inspect()).associationDigest,state.associationDigest);
  assert.deepEqual(disclosedSkill(x.contexts.at(-1)),first);
});

nativeTest('changed saved skill binding blocks the next provider invocation',async t=>{
  const x=await nativeSkillSession(t);const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  await host.prompt('first turn');
  const path=join(x.f.options.stateDirectory,'godskills.json');const record=JSON.parse(await readFile(path,'utf8'));
  record.disclosureDigest='f'.repeat(64);await writeFile(path,JSON.stringify(record));
  await assert.rejects(host.prompt('must not run'),/native-godskills:/);assert.equal(x.contexts.length,1);
});

nativeTest('selected source drift after a completed native write blocks the next inference',async t=>{
  const skills=await nativeSkillReleaseCopy(t);
  const x=await nativeSkillSession(t,{skills,responses:[{content:[{type:'toolCall',id:'before-drift',name:'write',arguments:{path:'first.txt',content:'completed before drift'}}]}]});
  const host=await openPiGodagentSession(x.options);x.f.dispose(()=>host.close());
  host.subscribe(event=>{if(event.type==='tool_execution_end')appendFileSync(join(skills.policy.releasePin.repositoryRoot,'skills/eternities-forge/SKILL.md'),'\nchanged');});
  await assert.rejects(host.prompt('write then continue'),/native-godskills:/);
  assert.equal(await readFile(join(x.f.cwd,'first.txt'),'utf8'),'completed before drift');
  assert.equal(x.contexts.length,1);assert.equal((await host.inspect()).actions[0].status,'completed');
});

nativeTest('a selected skill cannot upgrade a read-only native grant',async t=>{
  const x=await nativeSkillSession(t,{responses:[]});
  x.f.options.grant.allowedTools=['read'];x.f.options.expectedGrantDigest=sha256Value(x.f.options.grant);
  await assert.rejects(openPiGodagentSession(x.options),/native-godskills:effect-ceiling/);
  assert.equal(x.contexts.length,0);
});
