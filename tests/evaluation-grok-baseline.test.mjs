import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceRevisionStore } from '../src/workspace/revision-store.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { diagnosticFailure } from '../scripts/evaluation/attempt.mjs';
const { runGrokBaseline } = await import('../scripts/evaluation/grok-baseline.mjs').catch(error=>{
  if(error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

const policy = {provider:{modelId:'grok-4.6', maximumResponseBytes:65536},
  phases:{native:{maximumCompletionTokens:800,maximumCompletionBytes:32768}}};
function response(content = '{"changes":[]}') {
  return {kind:'subprocess-json-v1',outcome:'completed',exitCode:0,bodyText:JSON.stringify({
    text:JSON.stringify({content}),stopReason:'end_turn',num_turns:1,
    usage:{input_tokens:100,cache_read_input_tokens:15,cache_creation_input_tokens:5,
      output_tokens:10,reasoning_tokens:3,total_tokens:130},
    modelUsage:{'grok-4.6':{inputTokens:100,cacheReadInputTokens:15,outputTokens:10,modelCalls:1}},
  })};
}
async function setup(t) {
  assert.equal(typeof runGrokBaseline,'function','Grok baseline collector must exist');
  const directory=await mkdtemp(join(tmpdir(),'grok-baseline-test-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const journal=async()=>Promise.all((await readdir(directory)).sort().map(async name=>JSON.parse(await readFile(join(directory,name),'utf8'))));
  return {directory,journal};
}

test('Grok baseline persists verified usage before proposal parsing or staging can fail',async t=>{
  for(const failure of ['parse','prepare','stage']) {
    const f=await setup(t);let dispatched=0,staged=0;
    const result=await runGrokBaseline({directory:f.directory,policy,
      dispatch:async()=>{dispatched++;return response(failure==='parse'?'not-json':'{"changes":[]}');},
      assertResponseSafe:async()=>{},
      prepareAnswer:async proposal=>{assert.equal((await f.journal()).at(-1).event,'usage-recorded');
        if(failure==='prepare')throw Error('private source and secret must not persist');return proposal;},
      stageAnswer:async()=>{staged++;throw Error('private workspace path must not persist');},
    });
    assert.equal(result.status,'stopped');
    assert.equal(result.category,failure==='stage'?'workspace-stage-failed':'workspace-proposal-invalid');
    assert.deepEqual(result.usage,{inputTokens:120,completionTokens:10,reasoningTokens:3,cachedInputTokens:15});
    assert.equal(dispatched,1);assert.equal(staged,failure==='stage'?1:0);
    assert.equal(JSON.stringify(await f.journal()).includes('private'),false);
    assert.equal(result.retryAllowed,false);
  }
});

test('Grok baseline uses strict envelope and accounting checks before accepting any proposal',async t=>{
  for(const mode of ['answer','usage','safety','transport']) {
    const f=await setup(t);let accepted=0;
    const raw=response();const value=JSON.parse(raw.bodyText);
    if(mode==='answer')value.text='```json\n{}\n```';
    if(mode==='usage')value.usage.total_tokens=999;
    raw.bodyText=JSON.stringify(value);
    const result=await runGrokBaseline({directory:f.directory,policy,
      dispatch:async()=>{if(mode==='transport')throw Error('secret');return raw;},
      assertResponseSafe:async()=>{if(mode==='safety')throw Error('secret');},
      prepareAnswer:async p=>p,stageAnswer:async()=>{accepted++;},
    });
    assert.equal(accepted,0);assert.equal(result.status,'stopped');
    assert.equal(result.usageKnown,mode==='answer');
    assert.equal(result.category,({answer:'answer-envelope',usage:'usage-invalid',safety:'response-safety-check-failed',transport:'transport-failure'})[mode]);
    assert.equal(JSON.stringify(await f.journal()).includes('secret'),false);
  }
});

test('trusted launch and screening classifications survive while forged error labels stay private',async t=>{
  for(const site of ['dispatch','screen'])for(const trusted of [true,false]) {
    const f=await setup(t), category=site==='dispatch'?'dispatch-ceiling':'credential-reflection';
    const error=trusted?diagnosticFailure(category):Object.assign(Error('private'),{category,code:category});
    const result=await runGrokBaseline({directory:f.directory,policy,
      dispatch:async()=>{if(site==='dispatch')throw error;return response();},
      assertResponseSafe:async()=>{if(site==='screen')throw error;},prepareAnswer:async p=>p,stageAnswer:async()=>assert.fail('must not stage')});
    assert.equal(result.category,trusted?category:site==='dispatch'?'transport-failure':'response-safety-check-failed');
    assert.equal(result.usageKnown,false);assert.equal(result.retryAllowed,false);
    assert.equal(JSON.stringify(await f.journal()).includes('private'),false);
  }
});

test('Grok baseline records completion only after staging and refuses reuse of an attempted trial',async t=>{
  const f=await setup(t);let dispatched=0,staged=0;
  const options={directory:f.directory,policy,dispatch:async()=>{dispatched++;return response();},
    assertResponseSafe:async()=>{},prepareAnswer:async p=>p,
    stageAnswer:async(p,{usage})=>{assert.deepEqual(p,{changes:[]});assert.equal(usage.inputTokens,120);staged++;}};
  assert.equal((await runGrokBaseline(options)).status,'completed');
  assert.equal(staged,1);
  await assert.rejects(runGrokBaseline(options),{code:'EEXIST'});
  assert.equal(dispatched,1);
  assert.equal((await f.journal()).at(-1).status,'completed');
});

test('a usage persistence collision stops workspace acceptance without overwriting the evidence',async t=>{
  const f=await setup(t);let accepted=0;
  await writeFile(join(f.directory,'002-usage.json'),'preserved evidence');
  const result=await runGrokBaseline({directory:f.directory,policy,dispatch:async()=>response(),
    assertResponseSafe:async()=>{},prepareAnswer:async p=>{accepted++;return p;},stageAnswer:async()=>{accepted++;}});
  assert.equal(result.status,'stopped');assert.equal(result.usageKnown,false);assert.equal(accepted,0);
  assert.equal(await readFile(join(f.directory,'002-usage.json'),'utf8'),'preserved evidence');
});

test('prepared evidence is durable before staging and publication failures remain distinct',async t=>{
  for(const failure of ['evidence','stage','publication',null]) {
    const f=await setup(t);let staged=0,published=0;
    const result=await runGrokBaseline({directory:f.directory,policy,dispatch:async()=>response(),
      assertResponseSafe:async()=>{},prepareAnswer:async p=>p,
      persistPrepared:async p=>{if(failure==='evidence')throw Error('private');await writeFile(join(f.directory,'prepared.json'),JSON.stringify(p),{flag:'wx'});},
      stageAnswer:async()=>{staged++;assert.deepEqual(JSON.parse(await readFile(join(f.directory,'prepared.json'),'utf8')),{changes:[]});if(failure==='stage')throw Error('private');return {revisionDigest:'verified-revision'};},
      publishResult:async revision=>{published++;assert.equal(revision.revisionDigest,'verified-revision');if(failure==='publication')throw Error('private');},
    });
    assert.equal(result.status,failure?'stopped':'completed');
    if(failure)assert.equal(result.category,({evidence:'workspace-evidence-failed',stage:'workspace-stage-failed',publication:'workspace-publication-failed'})[failure]);
    assert.equal(staged,failure==='evidence'?0:1);assert.equal(published,['evidence','stage'].includes(failure)?0:1);
    assert.equal(result.usageKnown,true);assert.equal(JSON.stringify(await f.journal()).includes('private'),false);
  }
});

test('real revision staging retains usage on preimage rejection and preserves the original on success',async t=>{
  for(const badPreimage of [true,false]) {
    const f=await setup(t), sourceRoot=join(f.directory,'source'), root=join(f.directory,'store'), trial=join(f.directory,'trial');
    await mkdir(sourceRoot);await mkdir(root);await mkdir(trial);
    const original='export const value = 1;\n';await writeFile(join(sourceRoot,'app.js'),original);
    const store=await createWorkspaceRevisionStore({root,limits:{maxFiles:4,maxFileBytes:4096,maxTotalBytes:8192,maxRevisions:8,maxStoreBytes:65536}});
    const parent=await store.capture({sourceRoot,files:[{path:'app.js',sha256:sha256Text(original)}]});
    const proposal={parentDigest:parent.revisionDigest,changes:[{path:'app.js',expectedSha256:badPreimage?'0'.repeat(64):sha256Text(original),text:'export const value = 2;\n'}]};
    let revision;
    const result=await runGrokBaseline({directory:trial,policy,dispatch:async()=>response(JSON.stringify(proposal)),
      assertResponseSafe:async()=>{},prepareAnswer:async p=>({parentDigest:p.parentDigest,changes:p.changes.map(({text,...row})=>({...row,bytes:new TextEncoder().encode(text)}))}),
      stageAnswer:async p=>{revision=await store.revise(p);}});
    assert.equal(result.usageKnown,true);
    assert.equal(result.status,badPreimage?'stopped':'completed');
    if(badPreimage)assert.equal(result.category,'workspace-stage-failed');
    else assert.equal(Buffer.from(await store.read({revisionDigest:revision.revisionDigest,path:'app.js'})).toString(),'export const value = 2;\n');
    assert.equal(await readFile(join(sourceRoot,'app.js'),'utf8'),original);
  }
});
