import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { nativeSkillOptions, forgeObjective } from './helpers/native-godskills-policy.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { prepareNativeGodskills } from '../src/skills/native-godskills-binding.mjs';
import { nativeSkillReleaseCopy } from './helpers/native-godskills-release-copy.mjs';

async function setup(t,options=nativeSkillOptions()) {
  const f=await nativeAdmission(t);f.options.request.mission.objective=forgeObjective;
  const candidate=await compileCortexBindingCandidate({admission:f.options.admission,request:f.options.request});
  return {f,args:{options,candidate,request:f.options.request,grant:f.options.grant,
    effectCeiling:['local-read','local-write'],stateDirectory:f.options.stateDirectory,resume:false}};
}

test('verified native selection discloses only the chosen package and reuses its exact saved binding',async t=>{
  const {f,args}=await setup(t);const first=await prepareNativeGodskills(args);
  assert.match(first.recordDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual(first.disclosure.package.selectedCapabilities,['eternities-forge']);
  assert.equal(first.disclosure.package.selectedPackages[0].activationMode,'guardrail');
  assert.equal(first.disclosure.package.selectedPackages[0].entrypoint,undefined);
  const raw=await readFile(join(f.options.stateDirectory,'godskills.json'),'utf8');
  await first.validate();
  const resumed=await prepareNativeGodskills({...args,resume:true});
  assert.equal(resumed.recordDigest,first.recordDigest);
  assert.deepEqual(resumed.disclosure,first.disclosure);
  assert.equal(await readFile(join(f.options.stateDirectory,'godskills.json'),'utf8'),raw);
});

test('native selection rejects policy tampering, effect expansion, overflow and unsupported protocol',async t=>{
  const {args}=await setup(t);
  for(const mutate of [
    x=>{x.options.expectedPolicyDigest='a'.repeat(64);},
    x=>{x.options.policy.hostEnvelope.permittedEffects.push('network-write');},
    x=>{x.options.policy.maximumDisclosureBytes=64;},
    x=>{x.options.policy.protocolId='future-protocol';},
    x=>{x.options.policy.releasePin.systemReceipt.sha256='a'.repeat(64);},
  ]) {
    const changed=structuredClone(args);mutate(changed);
    if(changed.options.expectedPolicyDigest!=='a'.repeat(64))changed.options.expectedPolicyDigest=sha256Value(changed.options.policy);
    await assert.rejects(prepareNativeGodskills(changed),/native-godskills:/);
  }
});

test('saved selection cannot change mission, policy, or record during resume and subsequent validation',async t=>{
  const {args}=await setup(t);const first=await prepareNativeGodskills(args);
  const changed=structuredClone(args);changed.request.mission.objective+=' altered';
  await assert.rejects(prepareNativeGodskills({...changed,resume:true}),/native-godskills:/);
  const path=join(args.stateDirectory,'godskills.json'),record=JSON.parse(await readFile(path,'utf8'));
  record.binding.receipt.selected[0].contractSha256='f'.repeat(64);
  await writeFile(path,JSON.stringify(record));
  await assert.rejects(first.validate(),/native-godskills:/);
});

test('selected entrypoint drift is denied even for guardrail-only disclosure',async t=>{
  const skills=await nativeSkillReleaseCopy(t),{args}=await setup(t,skills);
  const bound=await prepareNativeGodskills(args);
  await appendFile(join(skills.policy.releasePin.repositoryRoot,'skills/eternities-forge/SKILL.md'),'\nchanged');
  await assert.rejects(bound.validate(),/native-godskills:/);
});

test('root drift is rechecked despite a warm cache and never changes an existing selection',async t=>{
  const skills=await nativeSkillReleaseCopy(t),{args}=await setup(t,skills);
  const bound=await prepareNativeGodskills(args);await bound.validate();
  await appendFile(join(skills.policy.releasePin.repositoryRoot,skills.policy.releasePin.systemReceipt.path),'\n');
  await assert.rejects(bound.validate(),/native-godskills:/);
});

test('explicit method references must belong to the selected eligible stack',async t=>{
  const {args}=await setup(t,nativeSkillOptions({explicitMethodRequests:['nonexistent-skill']}));
  await assert.rejects(prepareNativeGodskills(args),/native-godskills:/);
});

test('a mission with no qualified route does not silently run as skill-bound',async t=>{
  const {args}=await setup(t);args.request.mission.objective='hello';
  await assert.rejects(prepareNativeGodskills(args),/native-godskills:unresolved-route/);
});
