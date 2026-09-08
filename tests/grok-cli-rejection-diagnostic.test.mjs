import assert from 'node:assert/strict';
import test from 'node:test';
import { projectGrokCliRejectionDiagnostic, persistGrokCliRejectionDiagnostic } from '../src/transports/grok-cli-rejection-diagnostic.mjs';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const context={phase:'native',policyDigest:'a'.repeat(64),dispatchDigest:'b'.repeat(64),requestDigest:'c'.repeat(64),
  modelId:'grok-4.6',stage:'usage-accounting',maximumResponseBytes:65536};
test('rejection projection preserves bounded numeric accounting and field presence, never arbitrary provider text',()=>{
  const secret='fixture-provider-private-string';
  const bodyText=JSON.stringify({text:JSON.stringify({content:secret}),thought:secret,model:secret,stopReason:'end_turn',num_turns:1,
    usage:{input_tokens:17,output_tokens:4,reasoning_tokens:2,total_tokens:22,cache_read_input_tokens:1,[secret]:secret},
    modelUsage:{[secret]:{private:secret}}});
  const value=projectGrokCliRejectionDiagnostic({...context,bodyText});
  assert.equal(value.stage,'usage-accounting');
  assert.equal(value.observed.usage.input_tokens.value,17);
  assert.equal(value.observed.usage.cache_creation_input_tokens.type,'missing');
  assert.equal(value.observed.modelLedger.requestedModelPresent,false);
  assert.equal(value.observed.modelLedger.rowCount,1);
  assert.equal(value.observed.unknownUsageFieldCount,1);
  assert.equal(JSON.stringify(value).includes(secret),false);
  assert.equal(Object.hasOwn(value,'bodyText'),false);
  assert.equal(Object.hasOwn(value,'thought'),false);
  assert.equal(value.responseDigest.length,64);
  assert.equal(Object.isFrozen(value.observed.usage),true);
});
test('diagnostic publication is issued-only, idempotent, and refuses conflicts or junction redirection',async t=>{
  const root=await mkdtemp(join(tmpdir(),'grok-diagnostic-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const runtimeRoot=join(root,'operations');
  const slot=join(runtimeRoot,'native',context.dispatchDigest);
  await mkdir(slot,{recursive:true});
  const diagnostic=projectGrokCliRejectionDiagnostic({...context,bodyText:'{}'});
  persistGrokCliRejectionDiagnostic({runtimeRoot,diagnostic});
  const target=join(runtimeRoot,'grok-rejection-diagnostics-v1',`native-${context.dispatchDigest}.json`);
  const first=await readFile(target,'utf8');
  persistGrokCliRejectionDiagnostic({runtimeRoot,diagnostic});
  assert.equal(await readFile(target,'utf8'),first);
  assert.throws(()=>persistGrokCliRejectionDiagnostic({runtimeRoot,diagnostic:structuredClone(diagnostic)}));
  await writeFile(target,'conflicting diagnostic');
  assert.throws(()=>persistGrokCliRejectionDiagnostic({runtimeRoot,diagnostic}));
  assert.equal(await readFile(target,'utf8'),'conflicting diagnostic');
  await rm(slot,{recursive:true});
  const outside=join(root,'outside'); await mkdir(outside);
  await symlink(outside,slot,'junction');
  assert.throws(()=>persistGrokCliRejectionDiagnostic({runtimeRoot,diagnostic}));
  await assert.rejects(readFile(join(outside,'diagnostic.json')),{code:'ENOENT'});
});
test('malformed JSON and invalid counters stay unknown rather than becoming zero or raw error messages',()=>{
  const invalid=projectGrokCliRejectionDiagnostic({...context,stage:'terminal-json',bodyText:'private invalid JSON'});
  assert.equal(invalid.observed.terminalJson,'invalid');
  assert.equal(JSON.stringify(invalid).includes('private invalid'),false);
  const value=projectGrokCliRejectionDiagnostic({...context,bodyText:JSON.stringify({usage:{input_tokens:'private',output_tokens:-1,total_tokens:1e100}})});
  assert.deepEqual(value.observed.usage.input_tokens,{type:'string'});
  assert.deepEqual(value.observed.usage.output_tokens,{type:'number'});
  assert.deepEqual(value.observed.usage.total_tokens,{type:'number'});
  assert.throws(()=>projectGrokCliRejectionDiagnostic({...context,stage:'private-error',bodyText:'{}'}));
  assert.throws(()=>projectGrokCliRejectionDiagnostic({...context,bodyText:'x'.repeat(65537)}));
});
