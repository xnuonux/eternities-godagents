import { openSync, readSync, closeSync, fstatSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';

const require = createRequire(import.meta.url);
const loadedBridges = new Map();
const EXTRA_ARGS = Object.freeze(['--no-auto-update', '--disallowed-tools', 'search_tool,use_tool,Agent']);
const SAFE_ENV = new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','SYSTEMDRIVE','NUMBER_OF_PROCESSORS']);
function fail(code) { const error = new Error(`Grok CLI process ${code}`); error.code = code; throw error; }
function boundedBytes(path, limit) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) fail('file-invalid');
    const buffer = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const n = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (!n) break;
      offset += n;
    }
    if (offset > limit) fail('file-invalid');
    return buffer.subarray(0, offset);
  } catch { fail('file-invalid'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function digestFile(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 512 * 1024 * 1024) fail('program-pin');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(65536);
    let total = 0;
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      total += n;
      if (total > 512 * 1024 * 1024) fail('program-pin');
      hash.update(buffer.subarray(0, n));
    }
    return hash.digest('hex');
  } catch { fail('program-pin'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function checkPins(provider) {
  for (const pin of [provider.binary, provider.bridge]) if (digestFile(pin.path) !== pin.sha256) fail('program-pin');
}
function bridgeFor(provider) {
  checkPins(provider);
  const path = require.resolve(provider.bridge.path);
  const known = loadedBridges.get(path);
  if (known) {
    if (known.digest !== provider.bridge.sha256 || require.cache[path]?.exports !== known.exports) fail('bridge-cache');
    return known.functions;
  }
  // An unrelated earlier require is not proof of the currently pinned bytes.
  if (require.cache[path]) fail('bridge-cache');
  const exports = require(path);
  checkPins(provider);
  for (const key of ['invocation','runProcess','removeTempTree']) if (typeof exports[key] !== 'function') fail('bridge-interface');
  const functions = Object.freeze(Object.fromEntries(['invocation','runProcess','removeTempTree'].map(k => [k, exports[k].bind(exports)])));
  loadedBridges.set(path, { digest: provider.bridge.sha256, exports, functions });
  return functions;
}
function credentialSnapshot(path, requiredUntil = null) {
  const bytes = boundedBytes(path, 65536);
  let auth;
  try { auth = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); } catch { fail('credential-unavailable'); }
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) fail('credential-unavailable');
  const entries = Object.values(auth);
  if (!entries.length || entries.length > 4) fail('credential-unavailable');
  const secrets = [];
  for (const entry of entries) {
    if (!entry || entry.auth_mode !== 'oidc') fail('subscription-required');
    for (const key of ['key','refresh_token']) {
      if (typeof entry[key] !== 'string' || entry[key].length < 8 || entry[key].length > 16384 || /[\x00-\x1f]/.test(entry[key])) fail('credential-unavailable');
      secrets.push(entry[key]);
    }
    let issuer;
    try { issuer = new URL(entry.oidc_issuer); } catch { fail('subscription-required'); }
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password) fail('subscription-required');
    const expiry = typeof entry.expires_at === 'string' ? Date.parse(entry.expires_at) : NaN;
    if (!Number.isFinite(expiry) || (requiredUntil !== null && expiry <= requiredUntil)) fail('credential-expired');
  }
  return { digest: createHash('sha256').update(bytes).digest('hex'), secrets };
}
function secretFree(text, secrets) {
  const pending = [{value:text,depth:0}];
  let visited = 0;
  while (pending.length) {
    const {value,depth} = pending.pop();
    if (++visited > 20000 || depth > 16) return false;
    if (typeof value === 'string') {
      if (secrets.some(secret => value.includes(secret) || value.includes(JSON.stringify(secret).slice(1,-1)))) return false;
      // Parse nested JSON strings as well as the terminal envelope, so Unicode
      // escapes cannot turn screened bytes into a credential-bearing artifact.
      let decoded;
      try { decoded = JSON.parse(value); } catch { continue; }
      if (decoded !== value && (typeof decoded === 'string' || (decoded && typeof decoded === 'object'))) pending.push({value:decoded,depth:depth+1});
    } else if (value && typeof value === 'object') {
      for (const [key,child] of Object.entries(value)) {
        pending.push({value:key,depth:depth+1},{value:child,depth:depth+1});
      }
    }
  }
  return true;
}
function bridgeStdout(raw, limit) {
  if (!raw || typeof raw !== 'object'
      || ![Object.prototype,null].includes(Object.getPrototypeOf(raw))) fail('response-invalid');
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || !keys.includes('stdout') || !keys.includes('stderrBytes')) fail('response-invalid');
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  for (const key of keys) if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key],'value')) fail('response-invalid');
  const stdout = descriptors.stdout.value;
  const stderrBytes = descriptors.stderrBytes.value;
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > limit
      || !Number.isSafeInteger(stderrBytes) || stderrBytes < 0 || stderrBytes > 16384) fail('response-invalid');
  return stdout;
}
function expectedArgs(run, request) {
  return [...EXTRA_ARGS, '--prompt-file', join(run.root,'prompt.txt'), '--model',request.model,
    '--max-turns','1','--tools','','--no-subagents','--disable-web-search','--no-plan',
    '--permission-mode','dontAsk','--system-prompt-override',
    'You are a stateless inference worker. You have no tools. Return only the answer requested by the user messages.',
    '--output-format','json','--cwd',join(run.root,'work'),'--verbatim','--reasoning-effort',request.reasoningEffort,
    ...(Object.hasOwn(request,'outputSchema') ? ['--json-schema',JSON.stringify(request.outputSchema)] : [])];
}
function ownedRoot(root) {
  if (typeof root !== 'string' || resolve(root) !== root
      || dirname(root) !== realpathSync(tmpdir()) || !/^perseus-grok-cli-[A-Za-z0-9]+$/.test(basename(root))
      || realpathSync(root) !== root) fail('temporary-root');
  return root;
}
function isolatedEnv(run) {
  const home = join(run.root,'home');
  if (run.cwd !== join(run.root,'work') || run.env?.GROK_HOME !== home) fail('invocation-invalid');
  // Retain only OS plumbing. Inherited provider credentials, proxy overrides,
  // MCP configuration and model-routing variables cannot reach the subprocess.
  const env = Object.fromEntries(Object.entries(run.env).filter(([key]) => SAFE_ENV.has(key.toUpperCase())));
  Object.assign(env, { GROK_HOME:home, HOME:home, USERPROFILE:home, APPDATA:join(home,'appdata'),
    LOCALAPPDATA:join(home,'localappdata'), XDG_CONFIG_HOME:home, GROK_MEMORY:'0', GROK_SUBAGENTS:'0',
    GROK_WEB_FETCH:'0', GROK_CURSOR_MCPS_ENABLED:'false', GROK_CLAUDE_MCPS_ENABLED:'false', RUST_LOG:'off' });
  for (let path = run.cwd;; path = dirname(path)) {
    // Repository configuration walks cwd to the repository root. Refuse any
    // enclosing repository. The real user's home config is not a repository
    // ancestor and is replaced by GROK_HOME, so do not confuse it with one.
    if (existsSync(join(path,'.git'))) fail('workspace-inheritance');
    if ((path === run.cwd || path === run.root)
        && (existsSync(join(path,'.mcp.json')) || existsSync(join(path,'.grok','config.toml')))) fail('workspace-inheritance');
    if (dirname(path) === path) break;
  }
  return env;
}

export function createGrokCliPhaseProcess({policy} = {}) {
  const snapshot = structuredClone(policy);
  const policyDigest = sha256Value(snapshot);
  const provider = snapshot.provider;
  const capabilities = new WeakMap();
  const screen = ({text,credential}) => {
    const entry = capabilities.get(credential);
    return typeof text === 'string' && Boolean(entry) && secretFree(text,entry.secrets);
  };
  const credentialResolver = Object.freeze({ resolve() {
    const value = credentialSnapshot(provider.authFile, Date.now() + provider.timeoutMs + 60000);
    const capability = Object.freeze(Object.create(null));
    capabilities.set(capability,value);
    return capability;
  } });
  async function invoke({policy: supplied,credential,request}) {
    let run;
    let bridge;
    let cleanupRoot;
    let result;
    let failure = null;
    try {
      const cap = capabilities.get(credential);
      if (!cap || sha256Value(supplied) !== policyDigest || typeof request?.body !== 'string'
          || request.bodyBytes !== Buffer.byteLength(request.body)
          || request.requestDigest !== sha256Text(request.body) || request.bodyBytes > provider.maximumRequestBytes
          || !screen({text:request.body,credential})) fail('request-invalid');
      const r = JSON.parse(request.body);
      const structured = provider.structuredOutputProfile === 'json-schema-v1';
      if ((Object.hasOwn(provider,'structuredOutputProfile') && !structured)
          || request.body !== canonicalJson(r) || Object.keys(r).sort().join(',') !==
            (structured ? 'maxCompletionTokens,messages,model,outputSchema,reasoningEffort' : 'maxCompletionTokens,messages,model,reasoningEffort')
          || (structured && (!r.outputSchema || typeof r.outputSchema !== 'object' || Array.isArray(r.outputSchema)
            || r.outputSchema.type !== 'object' || r.outputSchema.additionalProperties !== false
            || !Array.isArray(r.outputSchema.required) || !r.outputSchema.required.length))
          || r.model !== provider.modelId || r.reasoningEffort !== provider.reasoningEffort
          || !Number.isSafeInteger(r.maxCompletionTokens) || r.maxCompletionTokens < 1 || r.maxCompletionTokens > 32000
          || !Array.isArray(r.messages) || r.messages.length !== 2
          || r.messages.some((m,i) => Object.keys(m).sort().join(',') !== 'content,role' || m.role !== (i===0?'system':'user') || typeof m.content !== 'string')) fail('request-invalid');
      if (credentialSnapshot(provider.authFile, Date.now()+provider.timeoutMs+60000).digest !== cap.digest) fail('credential-changed');
      bridge = bridgeFor(provider);
      run = bridge.invocation(r.messages,{ binary:provider.binary.path,authFile:provider.authFile,
        model:r.model,max_tokens:r.maxCompletionTokens,reasoning:{effort:r.reasoningEffort},
        ...(structured ? {response_format:{type:'json_schema',json_schema:{name:'godagent_phase',strict:true,schema:r.outputSchema}}} : {}),
        maxPromptBytes:provider.maximumRequestBytes,commandArgs:[...EXTRA_ARGS] });
      cleanupRoot = ownedRoot(run.root);
      if (run.command !== provider.binary.path || canonicalJson(run.args) !== canonicalJson(expectedArgs(run,r))) fail('invocation-invalid');
      if (credentialSnapshot(join(run.root,'home','auth.json')).digest !== cap.digest) fail('credential-changed');
      const env = isolatedEnv(run);
      const raw = await bridge.runProcess(run.command,run.args,{cwd:run.cwd,env,timeoutMs:provider.timeoutMs,stdoutLimit:provider.maximumResponseBytes});
      checkPins(provider);
      const stdout = bridgeStdout(raw,provider.maximumResponseBytes);
      // The pinned Perseus runProcess resolves only on child close code 0;
      // nonzero, signal, timeout and spawn failure reject. Its resolved shape
      // has no exitCode field. Reject contradictory/expanded return envelopes
      // rather than converting an arbitrary callback status to success.
      result = {kind:'subprocess-json-v1',outcome:'completed',exitCode:0,bodyText:stdout};
    } catch { failure = new Error('Grok CLI process did not produce a verified result'); failure.code='process-unresolved'; }
    finally {
      if (cleanupRoot && bridge) {
        let cleaned = false;
        try { cleaned = await bridge.removeTempTree(cleanupRoot); } catch {}
        if (!cleaned || existsSync(cleanupRoot)) { failure = new Error('Grok CLI temporary cleanup could not be verified'); failure.code='cleanup-unverified'; }
      }
    }
    if (failure) throw failure;
    return result;
  }
  function assertCredentialAbsent(value) {
    assertNoCredentialFields(value);
    const text = canonicalJson(value);
    // Screening is not readiness. Verified terminal replay must still work if
    // the auth file is absent; an actual dispatch resolves a fresh capability.
    if (existsSync(provider.authFile)) {
      const entry = credentialSnapshot(provider.authFile);
      if (!secretFree(text,entry.secrets)) fail('credential-in-input');
    }
    return structuredClone(value);
  }
  return Object.freeze({credentialResolver,process:Object.freeze({invoke,assertCredentialAbsent:screen}),assertCredentialAbsent});
}
