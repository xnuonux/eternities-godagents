import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';

const PIN = 'GODAGENT_GROK_PHASE_POLICY_SHA256';
const DIGEST = /^[a-f0-9]{64}$/;
const LIMIT = 65536;
export class GrokCliPhasePolicyError extends Error {
  constructor(code) {
    if (!['policy-integrity', 'policy-invalid'].includes(code)) throw new TypeError('invalid Grok policy error code');
    super(`Grok CLI phase ${code}`);
    this.name = 'GrokCliPhasePolicyError'; this.code = code;
  }
}
function fail(code) { throw new GrokCliPhasePolicyError(code); }
function absolute(value) { return typeof value === 'string' && value.length <= 4096 && isAbsolute(value) && !/[\x00-\x1f]/.test(value); }
function keys(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== [...names].sort().join('\0')) fail('policy-invalid');
}
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) fail('policy-invalid'); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function validate(p) {
  keys(p, ['schemaVersion', 'protocolId', 'policyId', 'provider', 'phases']);
  if (p.schemaVersion !== 1 || p.protocolId !== 'eternities-grok-cli-phase-transport-policy-v1'
      || typeof p.policyId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(p.policyId)) fail('policy-invalid');
  const v = p.provider;
  keys(v, ['transportKind', 'modelId', 'reasoningEffort', 'usageProfile', 'timeoutMs',
    'maximumRequestBytes', 'maximumResponseBytes', 'binary', 'bridge', 'authFile',
    ...(v && Object.hasOwn(v, 'reportedModelId') ? ['reportedModelId'] : []),
    ...(v && Object.hasOwn(v, 'nativeContextProfile') ? ['nativeContextProfile'] : [])]);
  if (v.transportKind !== 'subprocess-json-v1' || v.modelId !== 'grok-4.6'
      || (Object.hasOwn(v, 'reportedModelId') && !['grok-4.6', 'grok-4.6-build'].includes(v.reportedModelId))
      || (Object.hasOwn(v, 'nativeContextProfile') && v.nativeContextProfile !== 'objective-reference-v1')
      || v.usageProfile !== 'grok-headless-additive-v1' || !['low', 'medium', 'high'].includes(v.reasoningEffort)
      || !absolute(v.authFile)) fail('policy-invalid');
  integer(v.timeoutMs, 5000, 240000);
  integer(v.maximumRequestBytes, 1024, 1048576);
  integer(v.maximumResponseBytes, 1024, 2097152);
  for (const program of [v.binary, v.bridge]) {
    keys(program, ['path', 'sha256']);
    if (!absolute(program.path) || typeof program.sha256 !== 'string' || !DIGEST.test(program.sha256)) fail('policy-invalid');
  }
  keys(p.phases, ['native', 'review', 'revision']);
  for (const phase of ['native', 'review', 'revision']) {
    const c = p.phases[phase];
    keys(c, ['maximumCompletionBytes', 'maximumCompletionTokens', ...(phase === 'native' ? ['maximumDispatchBytes'] : [])]);
    integer(c.maximumCompletionTokens, 1, 32000);
    integer(c.maximumCompletionBytes, 1024, v.maximumResponseBytes);
    if (phase === 'native') integer(c.maximumDispatchBytes, 1024, v.maximumRequestBytes);
  }
}

export async function loadGrokCliPhasePolicy({ path, env } = {}) {
  if (!absolute(path)) fail('policy-integrity');
  let handle;
  let text;
  let policy;
  try {
    handle = await open(path, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > LIMIT) fail('policy-integrity');
    const buffer = Buffer.alloc(LIMIT + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > LIMIT) fail('policy-integrity');
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
    policy = JSON.parse(text);
    if (text !== `${canonicalJson(policy)}\n`) fail('policy-integrity');
  } catch { fail('policy-integrity'); }
  finally { if (handle) await handle.close(); }
  validate(policy);
  const digest = sha256Value(policy);
  if (typeof env?.[PIN] !== 'string' || !DIGEST.test(env[PIN]) || env[PIN] !== digest) fail('policy-integrity');
  return freeze({ policy, digest });
}
