import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { openNativeHostBinding } from './native-host-binding.mjs';
import { sha256Value } from '../core/digest.mjs';

// Optional, operator-installed host. No install, auth discovery, or global configuration.
export async function loadPiSdk(packageRoot) {
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.name !== '@earendil-works/pi-coding-agent' || metadata.version !== '0.85.1') {
    throw new Error('native-pi:unqualified-sdk-version');
  }
  const entry = join(packageRoot, 'dist/index.js');
  const require = createRequire(pathToFileURL(entry));
  const sdk = await import(pathToFileURL(entry));
  let aiEntry;
  for (const base of require.resolve.paths('@earendil-works/pi-ai')) {
    try {
      const root = join(base, '@earendil-works/pi-ai');
      const dependency = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      if (dependency.name !== '@earendil-works/pi-ai' || dependency.version !== metadata.version) {
        throw new Error('native-pi:unqualified-ai-version');
      }
      aiEntry = join(root, dependency.exports['.'].import);break;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!aiEntry) throw new Error('native-pi:missing-ai-runtime');
  const ai = await import(pathToFileURL(aiEntry));
  return Object.freeze({ sdk, ai, version: metadata.version });
}

export async function openPiGodagentSession({runtime,bindingOptions,agentDir,modelRuntime,model,
  sessionManager,settingsManager,reviewContext}={}) {
  if(runtime?.version!=='0.85.1'||!modelRuntime||!model||!sessionManager||!agentDir) {
    throw new Error('native-pi:explicit-host-configuration-required');
  }
  const {sdk,ai}=runtime;
  if(!bindingOptions.resume&&sessionManager.getEntries().length)throw new Error('native-pi:existing-history-requires-adoption');
  const binding=await openNativeHostBinding(bindingOptions);
  let session,closed=false,busy=false,denial,streamGuard,beforeGuard,afterGuard,providerFailed=false;
  let inferencePurpose='native';const warnings=new Set();
  const pending=new Map();
  const historyDigest=async()=>{
    const path=sessionManager.getSessionFile();
    if(!path)throw new Error('native-pi:persisted-session-required');
    const hash=createHash('sha256');let fileDigest=null;
    try {for await(const chunk of createReadStream(path))hash.update(chunk);fileDigest=hash.digest('hex');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    return sha256Value(JSON.parse(JSON.stringify({path,fileDigest,entries:sessionManager.getEntries(),leafId:sessionManager.getLeafId()})));
  };
  const facts=()=>({sessionId:session?.sessionId??sessionManager.getSessionId(),cwd:sessionManager.getCwd(),
    model:{provider:(session?.model??model).provider,id:(session?.model??model).id}});
  const reject=error=>{denial=error instanceof Error?error:new Error('native-pi:guard-failed');return denial;};
  const check=async(beginInference=true)=>{
    if(closed)throw new Error('native-pi:closed');
    if(denial)throw denial;
    if(session&&(session.agent.streamFunction!==streamGuard||session.agent.beforeToolCall!==beforeGuard
      ||session.agent.afterToolCall!==afterGuard))throw reject(new Error('native-pi:hooks-replaced'));
    return beginInference?binding.beforeInference(facts(),inferencePurpose):binding.validate(facts());
  };
  const errorStream=(requestModel,errorMessage='native-pi:authority-check-failed')=>{
    const stream=ai.createAssistantMessageEventStream();
    const message={role:'assistant',content:[],api:requestModel.api,provider:requestModel.provider,model:requestModel.id,
      usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
      stopReason:'error',errorMessage,timestamp:Date.now()};
    stream.push({type:'error',reason:'error',error:message});stream.end(message);return stream;
  };
  try {
    await binding.validate(facts());
    await binding.validateNativeHistory(await historyDigest());
    // This profile owns extension loading. It preserves Pi's core prompt, tools,
    // compaction and session tree, but never discovers a personal keel by accident.
    settingsManager??=sdk.SettingsManager.inMemory();
    const resourceLoader=new sdk.DefaultResourceLoader({cwd:facts().cwd,agentDir,settingsManager,
      noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true});
    await resourceLoader.reload();
    ({session}=await sdk.createAgentSession({cwd:facts().cwd,agentDir,modelRuntime,model,sessionManager,
      settingsManager,resourceLoader,tools:[...bindingOptions.grant.allowedTools],
      ...(reviewContext?{customTools:[sdk.createReadTool(facts().cwd,{operations:reviewContext.readOperations(facts().cwd)})]}:{})}));
    const previousStream=session.agent.streamFunction;
    const previousBefore=session.agent.beforeToolCall;
    const previousAfter=session.agent.afterToolCall;
    streamGuard=async(requestModel,context,options)=>{
      let actor;
      try {
        await reviewContext?.beforeInference();
        actor=await check();
        if(requestModel.provider!==facts().model.provider||requestModel.id!==facts().model.id) {
          throw new Error('native-pi:model-mismatch');
        }
      } catch(error) {reject(error);return errorStream(requestModel);}
      // Provider/runtime faults are not authority failures and must not revoke
      // the binding. Preserve normal Pi error streams; normalize only throws.
      try {
        const stream=await previousStream(requestModel,{...context,systemPrompt:(context.systemPrompt??'')+'\n\n'+actor},
          reviewContext?{...options,maxTokens:model.maxTokens}:options);
        if(!reviewContext)return stream;
        // A requested provider cap is not a consumption guarantee. Preserve the
        // native terminal message, but deny subsequent tools/inference and final
        // success when reported output exceeds the reservation or is unknown.
        const observe=message=>{
          const output=message?.usage?.outputTokens??message?.usage?.output;
          const known=Number.isSafeInteger(output)&&output>=0;
          if(known&&output>model.maxTokens)reject(new Error('native-operator:review-completion-overrun'));
          else if(!known&&!['error','aborted'].includes(message?.stopReason))reject(new Error('native-operator:review-usage-unknown'));
        };
        return {
          async *[Symbol.asyncIterator](){for await(const event of stream){
            if(event.type==='done'||event.type==='error')observe(event.message??event.error);
            yield event;
          }},
          async result(){const message=await stream.result();observe(message);return message;},
        };
      }
      catch {return errorStream(requestModel,'native-pi:provider-stream-failed');}
    };
    beforeGuard=async(context,signal)=>{
      try {
        if(denial)throw denial;
        const prior=await previousBefore?.(context,signal);
        if(prior?.block)return prior;
        const call={callId:context.toolCall.id,toolName:context.toolCall.name,input:context.args};
        await binding.beforeTool(call,facts());pending.set(call.callId,call);return prior;
      } catch(error) {reject(error);return {block:true,terminate:true,reason:'native-pi:authority-check-failed'};}
    };
    afterGuard=async(context,signal)=>{
      const call=pending.get(context.toolCall.id);
      if(call) {
        try {
          // Record the actual native result before optional presentation transforms.
          await binding.afterTool({...call,isError:context.isError,
            result:JSON.parse(JSON.stringify(context.result))});
          pending.delete(call.callId);
        } catch(error) {reject(error);throw error;}
      }
      return previousAfter?.(context,signal);
    };
    session.agent.streamFunction=streamGuard;
    session.agent.beforeToolCall=beforeGuard;
    session.agent.afterToolCall=afterGuard;
    session.subscribe(event=>{
      if(event.type==='auto_retry_end'&&event.success)warnings.add('native-provider-recovered');
      if(event.type==='compaction_start')inferencePurpose='compaction';
      if(event.type==='compaction_end'){
        inferencePurpose='native';if(event.errorMessage||event.aborted)warnings.add('native-compaction-failed');
      }
      if(event.type==='message_end'&&event.message.role==='assistant') {
        providerFailed=['error','aborted'].includes(event.message.stopReason);
      }
    });
    await binding.settle(await historyDigest());
  } catch(error) {session?.dispose();await binding.close();throw error;}
  return Object.freeze({
    sessionId:session.sessionId,
    get sessionFile(){return sessionManager.getSessionFile();},
    inspect:()=>binding.inspect(),
    subscribe:listener=>session.subscribe(listener),
    async prompt(text) {
      if(busy)throw new Error('native-pi:prompt-in-flight');busy=true;
      let started=false;
      try {
        await binding.validateNativeHistory(await historyDigest());providerFailed=false;warnings.clear();
        await check(false);started=true;await session.prompt(text);await session.waitForIdle();
        if(denial)throw denial;
        if(providerFailed)throw new Error('native-pi:provider-failed');
      } finally {
        busy=false;
        if(!closed&&started)await binding.settle(await historyDigest());
      }
      return {status:'native-turn-settled',warnings:[...warnings],state:await binding.inspect()};
    },
    async revoke(){await binding.revoke();await session.abort();},
    async close(){
      if(closed)return;closed=true;
      try{await session.abort();session.dispose();}finally{await binding.close();}
    },
  });
}
