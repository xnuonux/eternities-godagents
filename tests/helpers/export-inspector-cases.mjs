import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
export const row=(path,beforeText,afterText)=>({path,beforeSha256:hash(beforeText),afterSha256:hash(afterText),beforeText,afterText});
export const sample={parentDigest:'a'.repeat(64),revisionDigest:'b'.repeat(64),changes:[
  row('src/main.js','const version = 1;','const version = 2;'),
  row('README.md','Old instructions','New instructions: café 🌙'),
]};
export const hostile={...sample,changes:[row('markup.html','old','<img id="payload-marker" src=x onerror="alert(1)">')]};
const tampered=structuredClone(sample);tampered.changes[0].afterText='unverified replacement';
const duplicate=structuredClone(sample);duplicate.changes.push({...duplicate.changes[0]});
const load=value=>[{kind:'fill',selector:'#bundle-input',text:typeof value==='string'?value:JSON.stringify(value)},{kind:'click',selector:'#inspect'}];
const valid=[{kind:'click',selector:'#status[data-state="valid"]'}];
const invalid=[{kind:'click',selector:'#status[data-state="invalid"]'},{kind:'assert-count',selector:'#files button',count:0},{kind:'assert-text',selector:'#before',text:''},{kind:'assert-text',selector:'#after',text:''}];
export const inspectorSuite={schemaVersion:1,testId:'export-inspector.behavior',entryPath:'index.html',cases:[
  {caseId:'two-file-review',steps:[...load(sample),...valid,{kind:'assert-count',selector:'#files button',count:2},{kind:'click',selector:'#files button[data-path="src/main.js"]'},{kind:'assert-text',selector:'#before',text:'const version = 1;'},{kind:'assert-text',selector:'#after',text:'const version = 2;'},
    {kind:'click',selector:'#files button[data-path="README.md"]'},{kind:'assert-text',selector:'#after',text:'New instructions: café 🌙'},{kind:'assert-text',selector:'#boundary-note',text:'Read-only. Text hashes do not authenticate provenance or approve execution.'}]},
  {caseId:'tampered-text-rejected',steps:[...load(tampered),...invalid]},
  {caseId:'invalid-json-clears-prior-review',steps:[...load(sample),...valid,...load('{broken'),...invalid]},
  {caseId:'clear',steps:[...load(sample),...valid,{kind:'click',selector:'#clear'},{kind:'assert-count',selector:'#files button',count:0},{kind:'assert-text',selector:'#before',text:''},{kind:'assert-text',selector:'#after',text:''},{kind:'click',selector:'#status[data-state="idle"]'}]},
  {caseId:'markup-remains-text',steps:[...load(hostile),...valid,{kind:'click',selector:'#files button[data-path="markup.html"]'},{kind:'assert-text',selector:'#after',text:hostile.changes[0].afterText},{kind:'assert-count',selector:'#payload-marker',count:0}]},
  {caseId:'duplicate-path-rejected',steps:[...load(duplicate),...invalid]},
  {caseId:'unknown-authority-field-rejected',steps:[...load({...sample,approved:true}),...invalid]},
  {caseId:'unchanged-export',steps:[...load({...sample,revisionDigest:sample.parentDigest,changes:[]}),...valid,{kind:'assert-count',selector:'#files button',count:0},{kind:'assert-text',selector:'#after',text:''}]},
]};
