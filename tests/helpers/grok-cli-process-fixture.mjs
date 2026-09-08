import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';

export async function grokProcessFixture(t, mode = 'normal') {
  const root = await mkdtemp(join(tmpdir(), 'godagents-grok-process-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bridgePath = join(root, 'fixture-bridge.cjs');
  // Only the actual inference boundary is replaced. The owned bridge still
  // creates the prompt/config/isolated home; a real Node child returns synthetic
  // provider output. This is not a vendor CLI or live-model qualification.
  const bridgeSource = `
const bridge = require('C:/dev/perseus-v2/perseus-grok-cli.js');
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
module.exports = { ...bridge,
  invocation(messages, options) {
    const run = bridge.invocation(messages, options);
    fs.writeFileSync(path.join(__dirname,'last-root.txt'), run.root);
    const mode = fs.readFileSync(path.join(__dirname,'mode.txt'),'utf8');
    if(mode==='resume') run.args.push('--resume','previous-session');
    if(mode==='rotate') fs.appendFileSync(path.join(run.env.GROK_HOME,'auth.json'), ' ');
    return run;
  },
  async runProcess(command,args,options) {
    fs.appendFileSync(path.join(__dirname,'calls.txt'),'call\\n');
    const mode = fs.readFileSync(path.join(__dirname,'mode.txt'),'utf8');
    const prompt=fs.readFileSync(args[args.indexOf('--prompt-file')+1],'utf8');
    const input=JSON.parse(prompt.split('[user message 2]\\n')[1].split('\\n\\n[execution constraint]')[0]);
    const content=input.phase==='review' ? {recommendation:'accept',findings:[],summary:'synthetic exact review'}
      : input.phase==='revision' ? {addressedFindingIds:['bind-evidence'],content:'synthetic revision'} : {content:'synthetic native'};
    const value={text:JSON.stringify(content),stopReason:'end_turn',num_turns:1,
      usage:{input_tokens:100,cache_read_input_tokens:15,cache_creation_input_tokens:5,output_tokens:10,reasoning_tokens:3,total_tokens:130},
      modelUsage:{'grok-4.6':{inputTokens:100,cacheReadInputTokens:15,outputTokens:10,modelCalls:1}}};
    if(mode==='secret') value.text=JSON.stringify({content:'fixture-access-secret-123456'});
    if(mode==='missing-ledger') delete value.modelUsage;
    if(mode==='uncertain') throw new Error('fixture uncertain result');
    if(mode==='nonzero') return bridge.runProcess(process.execPath,['-e','process.stdout.write('+JSON.stringify(JSON.stringify(value))+');process.exit(7)'],options);
    if(mode==='timeout') return bridge.runProcess(process.execPath,['-e','setTimeout(()=>{},20000)'],options);
    const script='process.stdout.write('+JSON.stringify(JSON.stringify(value))+')';
    const result=await exec(process.execPath,['-e',script],{cwd:options.cwd,env:options.env,windowsHide:true,timeout:options.timeoutMs,maxBuffer:options.stdoutLimit});
    const raw={stdout:result.stdout,stderrBytes:0,...(mode==='returned-nonzero'?{exitCode:7}:{})};
    if(mode==='symbol-status') raw[Symbol('exitCode')]=7;
    if(mode==='accessor') Object.defineProperty(raw,'stdout',{enumerable:true,get(){fs.writeFileSync(path.join(__dirname,'getter-read.txt'),'read');return result.stdout;}});
    return raw;
  }
};
`;
  await writeFile(bridgePath, bridgeSource);
  await writeFile(join(root, 'mode.txt'), mode);
  const authPath = join(root, 'auth.json');
  const auth = { account: { auth_mode: 'oidc', key: 'fixture-access-secret-123456', refresh_token: 'fixture-refresh-secret-123456',
    expires_at: '2099-01-01T00:00:00.000Z', oidc_issuer: 'https://auth.example.invalid' } };
  await writeFile(authPath, JSON.stringify(auth));
  const binaryHash = createHash('sha256').update(await readFile(process.execPath)).digest('hex');
  const policy = {
    schemaVersion: 1, protocolId: 'eternities-grok-cli-phase-transport-policy-v1', policyId: 'grok-process-test',
    provider: { transportKind: 'subprocess-json-v1', modelId: 'grok-4.6', reasoningEffort: 'low', usageProfile: 'grok-headless-additive-v1',
      timeoutMs: 5000, maximumRequestBytes: 262144, maximumResponseBytes: 131072,
      binary: { path: process.execPath, sha256: binaryHash }, bridge: { path: bridgePath, sha256: sha256Text(bridgeSource) }, authFile: authPath },
    phases: { native: { maximumDispatchBytes: 131072, maximumCompletionBytes: 65536, maximumCompletionTokens: 16000 },
      review: { maximumCompletionBytes: 65536, maximumCompletionTokens: 16000 }, revision: { maximumCompletionBytes: 65536, maximumCompletionTokens: 16000 } },
  };
  const policyPath = join(root, 'policy.json');
  await writeFile(policyPath, `${canonicalJson(policy)}\n`);
  return { root, policy, policyPath, auth, authPath,
    env: { GODAGENT_GROK_PHASE_POLICY_SHA256: sha256Text(canonicalJson(policy)) },
    async calls() { try { return (await readFile(join(root, 'calls.txt'), 'utf8')).trim().split('\n').length; } catch (e) { if(e.code==='ENOENT') return 0; throw e; } },
  };
}
