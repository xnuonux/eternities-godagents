import { sha256Text, sha256Value } from '../core/digest.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { lstatSync, realpathSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
const issued=new WeakSet();

export function persistGrokCliRejectionDiagnostic({runtimeRoot,diagnostic}={}) {
  if(!issued.has(diagnostic)||typeof runtimeRoot!=='string'||!isAbsolute(runtimeRoot)||/[\x00-\x1f]/.test(runtimeRoot)) throw new TypeError('Grok diagnostic publication is invalid');
  const root=resolve(runtimeRoot);
  const phaseRoot=join(root,diagnostic.phase);
  const slot=join(phaseRoot,diagnostic.dispatchDigest);
  for(const directory of [root,phaseRoot,slot]) {
    const stat=lstatSync(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(directory)!==directory) throw new Error('Grok diagnostic directory is not owned');
  }
  const text=canonicalJson(diagnostic)+'\n';
  if(Buffer.byteLength(text)>16384) throw new Error('Grok diagnostic exceeds its bound');
  // Durable operation slots have a closed entry set. Keep optional diagnostics
  // in a separate namespace without changing that trusted journal contract.
  const diagnosticRoot=join(root,'grok-rejection-diagnostics-v1');
  try { mkdirSync(diagnosticRoot); } catch(error) { if(error.code!=='EEXIST') throw error; }
  const directoryStat=lstatSync(diagnosticRoot);
  if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink()||realpathSync(diagnosticRoot)!==diagnosticRoot) throw new Error('Grok diagnostic directory is not owned');
  const target=join(diagnosticRoot,`${diagnostic.phase}-${diagnostic.dispatchDigest}.json`);
  try { writeFileSync(target,text,{flag:'wx',flush:true}); }
  catch(error) {
    if(error.code!=='EEXIST') throw error;
    const stat=lstatSync(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384||readFileSync(target,'utf8')!==text) throw new Error('Grok diagnostic conflicts with existing evidence');
  }
}

export const GROK_REJECTION_STAGES=Object.freeze(['process-envelope','terminal-json','terminal-shape',
  'artifact-json','artifact-boundary','usage-accounting','phase-contract']);
const COUNTERS=['input_tokens','cache_read_input_tokens','cache_creation_input_tokens','output_tokens','reasoning_tokens','total_tokens'];
const ROW_COUNTERS=['inputTokens','cacheReadInputTokens','cacheCreationInputTokens','outputTokens','modelCalls'];
function object(value) { return value!==null&&typeof value==='object'&&!Array.isArray(value); }
function freeze(value) { if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);} return value; }
function describe(value) {
  const type=value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value;
  return {type,...(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=10_000_000?{value}:{})};
}
function jsonType(text) { try { const v=JSON.parse(text); return describe(v).type; } catch { return 'invalid'; } }

export function projectGrokCliRejectionDiagnostic({phase,policyDigest,dispatchDigest,requestDigest,modelId,stage,maximumResponseBytes,bodyText}={}) {
  if(!['native','review','revision'].includes(phase)||!GROK_REJECTION_STAGES.includes(stage)||modelId!=='grok-4.6'
      ||![policyDigest,dispatchDigest,requestDigest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))
      ||!Number.isSafeInteger(maximumResponseBytes)||maximumResponseBytes<1||maximumResponseBytes>2097152
      ||typeof bodyText!=='string'||Buffer.byteLength(bodyText)>maximumResponseBytes) throw new TypeError('Grok rejection diagnostic input is invalid');
  let parsed;
  try { parsed=JSON.parse(bodyText); } catch {}
  const envelope=object(parsed)?parsed:{};
  const usage=object(envelope.usage)?envelope.usage:{};
  const ledger=object(envelope.modelUsage)?envelope.modelUsage:null;
  const row=ledger&&object(ledger[modelId])?ledger[modelId]:{};
  const observed={
    terminalJson:jsonType(bodyText),
    fields:Object.fromEntries(['text','result','structured_output','stopReason','num_turns','model','usage','modelUsage','usage_is_incomplete','cost_is_partial'].map(k=>[k,describe(envelope[k])])),
    stopReasonIsEndTurn:typeof envelope.stopReason==='string'?envelope.stopReason==='end_turn':null,
    topLevelModelMatches:typeof envelope.model==='string'?envelope.model===modelId:null,
    textJson:typeof envelope.text==='string'?jsonType(envelope.text):'missing',
    usageIncomplete:typeof envelope.usage_is_incomplete==='boolean'?envelope.usage_is_incomplete:null,
    costPartial:typeof envelope.cost_is_partial==='boolean'?envelope.cost_is_partial:null,
    usage:Object.fromEntries(COUNTERS.map(k=>[k,describe(usage[k])])),
    unknownUsageFieldCount:object(envelope.usage)?Object.keys(usage).filter(k=>!COUNTERS.includes(k)).length:null,
    modelLedger:{rowCount:ledger?Object.keys(ledger).length:null,requestedModelPresent:ledger?Object.hasOwn(ledger,modelId):null,
      counters:Object.fromEntries(ROW_COUNTERS.map(k=>[k,describe(row[k])]))},
  };
  const record={schemaVersion:1,protocolId:'eternities-grok-rejection-diagnostic-v1',phase,policyDigest,dispatchDigest,requestDigest,
    responseDigest:sha256Text(bodyText),responseBytes:Buffer.byteLength(bodyText),stage,observed};
  const result=freeze({...record,recordDigest:sha256Value(record)});
  issued.add(result);
  return result;
}
