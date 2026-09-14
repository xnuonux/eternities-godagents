import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256Value } from '../src/core/digest.mjs';
import { captureNativeReviewSnapshot, loadNativeReviewSnapshot } from '../src/host/native-review-snapshot.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'native-review-snapshot-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const sourceRoot=join(root,'source'),sessionRoot=join(root,'session');
  const runId='11111111-1111-4111-8111-111111111111',sessionId='source-session',configDigest='a'.repeat(64);
  await mkdir(sourceRoot);const runPath=join(sessionRoot,'runs',runId);await mkdir(runPath,{recursive:true});
  await writeFile(join(sourceRoot,'a.mjs'),'export const answer = 42;\n');
  await writeFile(join(runPath,'started.json'),JSON.stringify({schemaVersion:1,command:'launch',sessionId,configDigest,startedAt:'2026-09-13T20:00:00.000Z'}));
  await writeFile(join(runPath,'result.json'),JSON.stringify({status:'native-turn-settled',finishedAt:'2026-09-13T20:01:00.000Z'}));
  await writeFile(join(runPath,'response.md'),'source handoff');
  const options={sourceRoot,files:['a.mjs'],sourceRun:{sessionRoot,sessionId,configDigest,runId},destinationPath:join(root,'snapshot.json')};
  const capture=overrides=>captureNativeReviewSnapshot({...options,...overrides});
  const load=snapshotDigest=>loadNativeReviewSnapshot({snapshotPath:options.destinationPath,snapshotDigest});
  return {root,options,runPath,capture,load};
}

test('snapshot reads captured bytes, not later filesystem bytes, and returns defensive copies',async t=>{
  const f=await fixture(t),snapshot=await f.capture(),loaded=await f.load(snapshot.snapshotDigest);
  assert.deepEqual(loaded.manifest.map(x=>x.path),['a.mjs']);
  const ops=loaded.readOperations(f.options.sourceRoot);
  await writeFile(join(f.options.sourceRoot,'a.mjs'),'changed after capture');
  const bytes=await ops.readFile(join(f.options.sourceRoot,'a.mjs'));
  assert.equal(bytes.toString(),'export const answer = 42;\n');bytes.fill(0);
  assert.equal((await ops.readFile(join(f.options.sourceRoot,'a.mjs'))).toString(),'export const answer = 42;\n');
  await assert.rejects(ops.access(join(f.root,'private.txt')),/review-path/);
  await assert.rejects(ops.readFile(join(f.options.sourceRoot,'not-selected.mjs')),/review-path/);
  await assert.rejects(ops.readFile(join(f.options.sourceRoot,'a.mjs:alternate')),/review-path/);
});

test('snapshot rejects malformed, escaping, duplicate and ambiguous file paths',async t=>{
  const f=await fixture(t);
  for(const files of [[],['../private'],['/absolute'],['a.mjs','a.mjs'],['a.mjs','A.mjs'],['a.mjs:secret'],['a.mjs '],['dir//a'],['dir/./a'],['a\\b'],['CON']]) {
    await assert.rejects(f.capture({files}),/review-(path|files)/);
  }
});

test('snapshot rejects links, binary data and oversized selected content',async t=>{
  const f=await fixture(t);
  await symlink(f.options.sourceRoot,join(f.options.sourceRoot,'linked'),'junction');
  await assert.rejects(f.capture({files:['linked/a.mjs']}),/review-path/);
  await writeFile(join(f.options.sourceRoot,'binary'),Buffer.from([0,255]));
  await assert.rejects(f.capture({files:['binary']}),/review-text/);
  await writeFile(join(f.options.sourceRoot,'large'),'x'.repeat(2*1024*1024+1));
  await assert.rejects(f.capture({files:['large']}),/review-size/);
});

test('snapshot requires the exact completed source run and never overwrites an existing snapshot',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.capture({sourceRun:{...f.options.sourceRun,configDigest:'b'.repeat(64)}}),/native-run-history:binding/);
  await f.capture();await assert.rejects(f.capture(),e=>e.code==='EEXIST');
  await writeFile(join(f.runPath,'result.json'),JSON.stringify({status:'failed',category:'native-pi:provider-failed',finishedAt:'2026-09-13T20:01:00.000Z'}));
  await assert.rejects(f.capture({destinationPath:join(f.root,'other.json')}),/review-source/);
});

test('snapshot load rejects digest drift and rehashed invalid structure/content',async t=>{
  const f=await fixture(t),snapshot=await f.capture();
  const original=JSON.parse(await readFile(f.options.destinationPath,'utf8'));
  for(const mutate of [x=>{x.files[0].text='tampered';},x=>{x.files[0].path='../secret';},x=>{x.files.push(x.files[0]);},x=>{x.unknown=true;}]) {
    const changed=structuredClone(original);mutate(changed);
    const {snapshotDigest,...body}=changed;changed.snapshotDigest=sha256Value(body);
    await writeFile(f.options.destinationPath,JSON.stringify(changed));
    await assert.rejects(f.load(snapshot.snapshotDigest),/review-snapshot/);
    await assert.rejects(f.load(changed.snapshotDigest),/review-(snapshot|path|files)/);
  }
});
