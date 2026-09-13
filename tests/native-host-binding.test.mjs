import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { openNativeHostBinding } from '../src/host/native-host-binding.mjs';

test('a native grant cannot turn a read/write actor into a shell actor',async t=>{
  const f=await nativeAdmission(t);
  f.options.grant.allowedTools.push('powershell');
  f.options.expectedGrantDigest=sha256Value(f.options.grant);
  await assert.rejects(()=>openNativeHostBinding(f.options),/effect-ceiling/);
});

test('host pin, native session and model are authoritative, not model prose',async t=>{
  const f=await nativeAdmission(t);
  await assert.rejects(()=>openNativeHostBinding({...f.options,expectedGrantDigest:'0'.repeat(64)}),/grant-pin/);
  const binding=await openNativeHostBinding(f.options);f.dispose(()=>binding.close());
  await assert.rejects(()=>binding.beforeInference({...f.host,sessionId:'different'}),/host-mismatch/);
  await assert.rejects(()=>binding.beforeInference({...f.host,model:{provider:'fixture',id:'other'}}),/host-mismatch/);
  const context=await binding.beforeInference(f.host);
  assert.ok(context.includes('native-mission'));
  assert.ok(context.includes(f.options.grant.instanceId));
  assert.ok(context.length<32768);
  await binding.settle();
});

test('native actions bind arguments and results without storing their raw bodies',async t=>{
  const f=await nativeAdmission(t,{processAccess:true});
  const b=await openNativeHostBinding(f.options);f.dispose(()=>b.close());
  await b.beforeInference(f.host);
  const call={callId:'call-1',toolName:'write',input:{path:'note.txt',content:'private payload sentinel'}};
  await b.beforeTool(call,f.host);
  await assert.rejects(()=>b.beforeTool(call,f.host),/duplicate-call/);
  await b.afterTool({...call,isError:false,result:{content:'private result sentinel'}});
  await b.beforeTool({callId:'shell',toolName:'powershell',input:{command:'Get-Location'}},f.host);
  await b.afterTool({callId:'shell',toolName:'powershell',input:{command:'Get-Location'},isError:false,result:{exitCode:0}});
  await b.settle();
  const state=await b.inspect();
  assert.equal(state.phase,'idle');
  assert.equal(state.actions.length,2);
  assert.equal(state.actions[0].status,'completed');
  const raw=await readFile(join(f.options.stateDirectory,'session.json'),'utf8');
  assert.ok(!raw.includes('private payload sentinel'));
  assert.ok(!raw.includes('private result sentinel'));
});

test('revocation and expiry deny the next native action',async t=>{
  const f=await nativeAdmission(t);const b=await openNativeHostBinding(f.options);f.dispose(()=>b.close());
  await b.beforeInference(f.host);
  await assert.rejects(()=>b.beforeTool({callId:'unknown',toolName:'unknown',input:{}},f.host),/tool-denied/);
  await b.revoke();
  await assert.rejects(()=>b.beforeTool({callId:'later',toolName:'write',input:{}},f.host),/revoked/);
  const g=await nativeAdmission(t);const c=await openNativeHostBinding(g.options);g.dispose(()=>c.close());
  g.advance(3600001);
  await assert.rejects(()=>c.beforeInference(g.host),/expired/);
});

test('clean resume retains actor/session and refuses an unresolved native write',async t=>{
  const f=await nativeAdmission(t);let b=await openNativeHostBinding(f.options);
  await b.beforeInference(f.host);await b.settle();const original=await b.inspect();await b.close();
  b=await openNativeHostBinding({...f.options,resume:true});
  assert.equal((await b.inspect()).associationDigest,original.associationDigest);
  await b.beforeInference(f.host);
  await b.beforeTool({callId:'unresolved',toolName:'write',input:{path:'x',content:'y'}},f.host);
  await b.close();
  await assert.rejects(()=>openNativeHostBinding({...f.options,resume:true}),/unresolved/);
});

test('missing resume state and corrupted native records fail closed',async t=>{
  const f=await nativeAdmission(t);
  await assert.rejects(()=>openNativeHostBinding({...f.options,resume:true}),/missing-state/);
  const b=await openNativeHostBinding(f.options);await b.close();
  const path=join(f.options.stateDirectory,'session.json');const state=JSON.parse(await readFile(path,'utf8'));
  state.phase='running';await writeFile(path,JSON.stringify(state));
  await assert.rejects(()=>openNativeHostBinding({...f.options,resume:true}),/state-integrity/);
});

test('settle and close preserve corrupt on-disk evidence instead of overwriting it',async t=>{
  const f=await nativeAdmission(t);const b=await openNativeHostBinding(f.options);
  await b.beforeInference(f.host);
  const path=join(f.options.stateDirectory,'session.json');const corrupt='{"corrupt":true}\n';
  await writeFile(path,corrupt);
  await assert.rejects(b.settle(),/state-integrity/);
  await assert.rejects(b.close(),/state-integrity/);
  assert.equal(await readFile(path,'utf8'),corrupt);
});

test('host call budget denies the next action and mismatched results remain unresolved',async t=>{
  const f=await nativeAdmission(t);f.options.grant.maxToolCalls=1;
  f.options.expectedGrantDigest=sha256Value(f.options.grant);
  const b=await openNativeHostBinding(f.options);f.dispose(()=>b.close());await b.beforeInference(f.host);
  const call={callId:'one',toolName:'write',input:{path:'x',content:'y'}};
  await b.beforeTool(call,f.host);
  await assert.rejects(b.afterTool({...call,input:{path:'other'},isError:false,result:{}}),/result-mismatch/);
  await assert.rejects(b.beforeTool({...call,callId:'two'},f.host),/tool-budget/);
  await assert.rejects(b.settle(),/unresolved/);assert.equal((await b.inspect()).phase,'uncertain');
});

test('opaque provider call IDs preserve distinct native actions, duplicate checks and resume',async t=>{
  const f=await nativeAdmission(t);let b=await openNativeHostBinding(f.options);
  f.dispose(()=>b.close());await b.beforeInference(f.host);
  const ids=['call-1bc2c1b3-b46f-4e8a-a8a3-85c094687803-0|fc_806f999a-72a5-9b05-9325-ac25110d165f_0',
    'call-1bc2c1b3-b46f-4e8a-a8a3-85c094687803-0|fc_distinct', 'x'.repeat(1024)];
  for(const callId of ids) {
    const call={callId,toolName:'read',input:{path:'viewer.js'}};
    await b.beforeTool(call,f.host);
    await assert.rejects(b.beforeTool(call,f.host),/duplicate-call/);
    await b.afterTool({...call,isError:false,result:{content:'native source'}});
  }
  await b.settle();await b.close();
  b=await openNativeHostBinding({...f.options,resume:true});
  assert.deepEqual((await b.inspect()).actions.map(a=>[a.callId,a.status]),ids.map(id=>[id,'completed']));
});

test('malformed or oversized tool IDs never become pending native actions',async t=>{
  const f=await nativeAdmission(t),b=await openNativeHostBinding(f.options);f.dispose(()=>b.close());
  await b.beforeInference(f.host);
  for(const callId of ['',null,7,{},'bad\ncall','bad\u0000call','bad call','x'.repeat(1025),'é'.repeat(513)]) {
    await assert.rejects(b.beforeTool({callId,toolName:'read',input:{}},f.host),/tool-denied/);
  }
  assert.equal((await b.inspect()).actions.length,0);await b.settle();
});
