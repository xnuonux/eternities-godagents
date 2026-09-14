import { lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { sha256Value, sha256Text } from '../core/digest.mjs';
import { readNativeRunHistory } from './native-run-history.mjs';

const MAX_BYTES=2*1024*1024,MAX_FILES=100,MAX_RECORD_BYTES=16*1024*1024;
const digest=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail=code=>{throw new Error(`native-operator:review-${code}`);};
const exact=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...keys].sort()))fail('snapshot');
};
function filePath(path) {
  if(typeof path!=='string'||!path||path.length>512||/[\\:\x00-\x1f\x7f]/.test(path)||isAbsolute(path))fail('path');
  for(const part of path.split('/'))if(!part||part==='.'||part==='..'||/[. ]$/.test(part)
    ||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))fail('path');
  return path;
}
function paths(files) {
  if(!Array.isArray(files)||files.length<1||files.length>MAX_FILES)fail('files');
  const seen=new Set();
  for(const path of files){filePath(path);const key=path.toLowerCase();if(seen.has(key))fail('files');seen.add(key);}
}
function verify(value,pin) {
  exact(value,['schemaVersion','protocolId','sourceRun','files','snapshotDigest']);
  if(!digest.test(pin??'')||value.snapshotDigest!==pin)fail('snapshot');
  const {snapshotDigest,...body}=value;if(sha256Value(body)!==snapshotDigest)fail('snapshot');
  if(value.schemaVersion!==1||value.protocolId!=='eternities-native-review-snapshot-v1')fail('snapshot');
  exact(value.sourceRun,['sessionId','configDigest','runId','resultSha256']);
  if(typeof value.sourceRun.sessionId!=='string'||!value.sourceRun.sessionId
    ||!uuid.test(value.sourceRun.runId)||!digest.test(value.sourceRun.configDigest)||!digest.test(value.sourceRun.resultSha256))fail('snapshot');
  if(!Array.isArray(value.files))fail('files');paths(value.files.map(x=>x?.path));
  let size=0;
  for(const row of value.files){
    exact(row,['path','text','sha256']);
    if(typeof row.text!=='string'||row.text.includes('\0')||Buffer.from(row.text,'utf8').toString('utf8')!==row.text
      ||row.sha256!==sha256Text(row.text))fail('snapshot');
    size+=Buffer.byteLength(row.text);if(size>MAX_BYTES)fail('size');
  }
  return value;
}
async function safeBytes(path,limit=MAX_RECORD_BYTES) {
  const info=await lstat(path);
  if(info.isSymbolicLink()||!info.isFile())fail('path');if(info.size>limit)fail('size');
  const bytes=await readFile(path);if(bytes.length>limit)fail('size');return bytes;
}

export async function captureNativeReviewSnapshot({sourceRoot,files,sourceRun,destinationPath}={}) {
  paths(files);
  if(!isAbsolute(sourceRoot??'')||!isAbsolute(destinationPath??''))fail('path');
  exact(sourceRun,['sessionRoot','sessionId','configDigest','runId']);
  const root=await realpath(sourceRoot);if((await lstat(sourceRoot)).isSymbolicLink())fail('path');
  const history=await readNativeRunHistory({sessionRoot:sourceRun.sessionRoot,expectedSessionId:sourceRun.sessionId,expectedConfigDigest:sourceRun.configDigest});
  if(!history.entries.some(x=>x.runId===sourceRun.runId&&x.status==='native-turn-settled'))fail('source');
  const result=await safeBytes(join(sourceRun.sessionRoot,'runs',sourceRun.runId,'result.json'));
  const rows=[];let size=0;
  for(const path of files) {
    let full=root;
    for(const part of path.split('/')){full=join(full,part);if((await lstat(full)).isSymbolicLink())fail('path');}
    const bytes=await safeBytes(full,MAX_BYTES-size);size+=bytes.length;
    const text=bytes.toString('utf8');if(text.includes('\0')||!Buffer.from(text,'utf8').equals(bytes))fail('text');
    rows.push({path,text,sha256:sha256Text(text)});
  }
  rows.sort((a,b)=>a.path.localeCompare(b.path));
  const body={schemaVersion:1,protocolId:'eternities-native-review-snapshot-v1',sourceRun:{sessionId:sourceRun.sessionId,
    configDigest:sourceRun.configDigest,runId:sourceRun.runId,resultSha256:sha256Text(result.toString('utf8'))},files:rows};
  const value={...body,snapshotDigest:sha256Value(body)};verify(value,value.snapshotDigest);
  const serialized=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)fail('size');
  await writeFile(destinationPath,serialized,{flag:'wx'});return value;
}

export async function loadNativeReviewSnapshot({snapshotPath,snapshotDigest}={}) {
  if(!isAbsolute(snapshotPath??''))fail('path');
  let value;try{value=JSON.parse((await safeBytes(snapshotPath)).toString('utf8'));}
  catch(error){if(error.message?.startsWith('native-operator:review-'))throw error;fail('snapshot');}
  verify(value,snapshotDigest);
  const bytes=new Map(value.files.map(x=>[x.path.toLowerCase(),Buffer.from(x.text,'utf8')]));
  const manifest=value.files.map(({path,sha256,text})=>Object.freeze({path,sha256,bytes:Buffer.byteLength(text)}));
  return Object.freeze({snapshotDigest,sourceRun:Object.freeze({...value.sourceRun}),manifest:Object.freeze(manifest),
    readOperations(cwd){
      if(!isAbsolute(cwd??''))fail('path');
      const selected=absolute=>{
        if(typeof absolute!=='string'||!isAbsolute(absolute))fail('path');
        const key=relative(resolve(cwd),resolve(absolute)).replaceAll('\\','/');filePath(key);
        const found=bytes.get(key.toLowerCase());if(!found)fail('path');return found;
      };
      return Object.freeze({access:async path=>{selected(path);},readFile:async path=>Buffer.from(selected(path)),detectImageMimeType:async path=>{selected(path);return null;}});
    },
  });
}
