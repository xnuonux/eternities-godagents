import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileCreation } from '../../src/creation/compile.mjs';
import { admitLocalCreation } from '../../src/genesis/local-admission.mjs';
import { createLocalKeelBackend } from '../../src/keel/local-reference-backend.mjs';
import { compileCortexBindingCandidate } from '../../src/cortex/binding-compiler.mjs';
import { sha256Value } from '../../src/core/digest.mjs';

export async function nativeAdmission(t, { processAccess = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-native-host-'));
  const disposers=[];
  t.after(async()=>{try{for(const dispose of disposers.reverse())await dispose();}finally{await rm(root,{recursive:true,force:true});}});
  const source = join(root,'source');
  await cp(new URL('../../fixtures/creation/',import.meta.url),source,{recursive:true});
  const read = async path => JSON.parse(await readFile(path,'utf8'));
  const candidate = await read(join(source,'creation-candidate.json'));
  const policy = await read(join(source,'creation-policy.json'));
  if(processAccess) {
    candidate.constitution.allowedEffects.push('process-exec');
    policy.allowedEffects.push('process-exec');
    candidate.realm.requiredCapabilities.push('process.exec');
    policy.allowedRealmCapabilities.push('process.exec');
  }
  await writeFile(join(source,'creation-candidate.json'),JSON.stringify(candidate));
  await writeFile(join(source,'creation-policy.json'),JSON.stringify(policy));
  const expectedPolicyDigest = sha256Value(policy);
  const creation = await compileCreation({candidatePath:join(source,'creation-candidate.json'),policyPath:join(source,'creation-policy.json'),expectedPolicyDigest,expressionPath:join(source,'expression-overlay.json'),moduleDirectory:join(source,'modules'),outputDir:join(root,'creation')});
  const realm = await read(new URL('../../fixtures/realm-contract.json',import.meta.url));
  realm.capabilities = ['filesystem.read','filesystem.write',...(processAccess?['process.exec']:[])];
  realm.compatibleDistributions=['0.2.x'];
  await writeFile(join(root,'realm.json'),JSON.stringify(realm));
  await writeFile(join(root,'prompt.md'),'<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: native-host-fixture -->\n# Native host fixture\n');
  const instanceId='native-pi-test-actor', creatorRef='creator:dom';
  const workspace=join(root,'actor');
  await admitLocalCreation({creationDir:join(root,'creation'),expectedPolicyDigest,expectedCreationBuildId:creation.manifest.buildId,promptArtifactPath:join(root,'prompt.md'),realmContractPath:join(root,'realm.json'),workspace,instanceId,creatorRef,checkpointPurpose:'native host mechanics fixture'});
  const admissionRoot=join(workspace,'admission');
  const admission={receiptPath:join(admissionRoot,'transaction/genesis-receipt.json'),creationDir:join(admissionRoot,'creation'),distributionDir:join(admissionRoot,'distribution'),expectedPolicyDigest,expectedCreationBuildId:creation.manifest.buildId,instanceId,creatorRef,transactionDir:join(admissionRoot,'transaction'),journalPath:join(admissionRoot,'vessel/journal.jsonl'),keelAdapter:createLocalKeelBackend({root:join(admissionRoot,'keels')})};
  const cwd=join(root,'project');await cp(new URL('../../examples/workspace-export-inspector/',import.meta.url),cwd,{recursive:true});
  const request={schemaVersion:1,task:{taskId:'pi-native-session-fixture',hostAdapterId:'pi-sdk-v1',revocationEpoch:0},mission:{missionId:'native-mission',objective:'use the native host to improve the assigned project',successEvidence:['independent file and test verification'],stopConditions:['authority revoked','unresolved native action'],budget:{maxCycles:100,maxCompletionTokens:32000},observation:{observationId:'initial-files',summary:'source is on disk, not in the objective',evidenceDigests:[]}},maxProjectionBytes:32768};
  const compiled=await compileCortexBindingCandidate({admission,request});
  let now=Date.now();
  const grant={schemaVersion:1,protocolId:'eternities-native-host-grant-v1',instanceId,identityDigest:compiled.fullEnvelope.sectionDigests.identity,realmContractDigest:compiled.fullEnvelope.authority.realmContractDigest,sessionId:'pi-native-session-fixture',cwd,model:{provider:'fixture',id:'native-model'},expiresAt:new Date(now+3600000).toISOString(),allowedTools:['read','write','edit',...(processAccess?['powershell','bash']:[])],maxToolCalls:100};
  const options={admission,request,grant,expectedGrantDigest:sha256Value(grant),stateDirectory:join(root,'native-state'),registryRoot:join(root,'bindings'),instanceRegistryRoot:join(root,'instances'),clock:()=>now};
  const host={sessionId:grant.sessionId,cwd,model:grant.model};
  return {root,cwd,options,host,compiled,dispose(fn){disposers.push(fn);},advance(ms){now+=ms;}};
}
