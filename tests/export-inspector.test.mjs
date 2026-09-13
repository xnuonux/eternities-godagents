import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sample,row,inspectorSuite} from './helpers/export-inspector-cases.mjs';
import {createWorkspaceRevisionStore} from '../src/workspace/revision-store.mjs';
import {exportWorkspaceRevision} from '../src/workspace/revision-export.mjs';
import {createBrowserWorkspaceTestRunner} from '../src/workspace/browser-test-runner.mjs';
import {compileBrowserTestSuite} from '../src/workspace/browser-test-contracts.mjs';
import {sha256Text} from '../src/core/digest.mjs';
const moduleUrl=new URL('../examples/workspace-export-inspector/viewer.js',import.meta.url);
const {inspectBundle}=await import(moduleUrl).catch(error=>{if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;return {};});
const inspect=async value=>{assert.equal(typeof inspectBundle,'function','inspector must provide the tested parser');return inspectBundle(typeof value==='string'?value:JSON.stringify(value));};

test('inspector accepts real export shape and verifies UTF-8 including BOM and empty text',async()=>{
  const value={...sample,changes:[...sample.changes,row('bom.txt','\uFEFFbefore',''),row('empty.txt','','🌙')]};
  assert.deepEqual(await inspect(value),value);
  assert.deepEqual(await inspect({...sample,revisionDigest:sample.parentDigest,changes:[]}),{...sample,revisionDigest:sample.parentDigest,changes:[]});
});
test('inspector rejects changed before or after bytes and malformed digests',async()=>{
  for(const field of ['beforeText','afterText','beforeSha256','afterSha256']) {
    const value=structuredClone(sample);value.changes[0][field]='changed';await assert.rejects(inspect(value));
  }
});
test('inspector rejects unsupported shapes instead of accepting approval-like metadata',async()=>{
  for(const value of [null,[],{},'{broken',{...sample,approved:true},{...sample,parentDigest:'invalid'},
    {...sample,changes:[{...sample.changes[0],approved:true}]},{...sample,changes:[{...sample.changes[0],afterText:7}]}])await assert.rejects(inspect(value));
});
test('inspector rejects unsafe or duplicate paths, NUL and malformed UTF-16',async()=>{
  for(const path of ['../secret','/absolute','C:/absolute','x\\y','x\u0000y','\uD800'])await assert.rejects(inspect({...sample,changes:[row(path,'a','b')]}));
  await assert.rejects(inspect({...sample,changes:[sample.changes[0],{...sample.changes[0],path:'SRC/MAIN.JS'}]}));
  for(const text of ['x\u0000y','\uD800'])await assert.rejects(inspect({...sample,changes:[row('app.js','before',text)]}));
});
test('inspector bounds input and rows before expensive verification',async()=>{
  await assert.rejects(inspect(' '.repeat(1048577)));
  await assert.rejects(inspect({...sample,changes:Array.from({length:65},(_,i)=>row(`file-${i}.txt`,'a','b'))}));
});

test('inspector consumes an actual checked revision export without an adapter',async t=>{
  const root=await mkdtemp(join(tmpdir(),'inspector-export-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const sourceRoot=join(root,'source'),storeRoot=join(root,'store');await mkdir(sourceRoot);await mkdir(storeRoot);
  await writeFile(join(sourceRoot,'note.txt'),'original');
  const store=await createWorkspaceRevisionStore({root:storeRoot,limits:{maxFiles:4,maxFileBytes:4096,maxTotalBytes:8192,maxRevisions:4,maxStoreBytes:65536}});
  const parent=await store.capture({sourceRoot,files:[{path:'note.txt',sha256:sha256Text('original')}]});
  const child=await store.revise({parentDigest:parent.revisionDigest,changes:[{path:'note.txt',expectedSha256:sha256Text('original'),bytes:new TextEncoder().encode('revised 🌙')}]});
  const bundle=await exportWorkspaceRevision({store,parentDigest:parent.revisionDigest,revisionDigest:child.revisionDigest});
  assert.deepEqual(await inspect(bundle),bundle);
  assert.equal(await readFile(join(sourceRoot,'note.txt'),'utf8'),'original');
});

const runtimePath=process.env.GODAGENTS_WORKSPACE_BROWSER_RUNTIME;
test('export inspector real browser accepts exact bundles, clears stale views and renders hostile markup inertly',{skip:!runtimePath},async t=>{
  const root=await mkdtemp(join(tmpdir(),'export-inspector-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const storeRoot=join(root,'store');await mkdir(storeRoot);
  const limits={maxFiles:4,maxFileBytes:65536,maxTotalBytes:131072,maxRevisions:4,maxStoreBytes:1048576};
  const sourceRoot=fileURLToPath(new URL('../examples/workspace-export-inspector',import.meta.url));
  const store=await createWorkspaceRevisionStore({root:storeRoot,limits});
  const files=await Promise.all(['index.html','viewer.js','app.css'].map(async path=>({path,sha256:sha256Text(await readFile(join(sourceRoot,path)))})));
  const revision=await store.capture({sourceRoot,files});
  const runner=await createBrowserWorkspaceTestRunner({store:{root:storeRoot,limits},runtime:JSON.parse(await readFile(runtimePath,'utf8')),
    policy:{schemaVersion:1,profile:'host-reviewed-browser-local-v1',approvedRevisionDigests:[revision.revisionDigest],limits:{maxFiles:4,maxAppBytes:131072,maxResultBytes:16384,stepTimeoutMs:1500,launchTimeoutMs:10000,runTimeoutMs:45000,cleanupTimeoutMs:5000}},suites:[compileBrowserTestSuite(inspectorSuite)]});
  const result=await runner.run({revisionDigest:revision.revisionDigest,testId:inspectorSuite.testId});
  assert.equal(result.outcome,'passed',JSON.stringify(result));
});
