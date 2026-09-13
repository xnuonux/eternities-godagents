import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { sha256Value } from '../core/digest.mjs';
import { nativeToolEffects } from './native-host-binding.mjs';
import { validateNativeGodskillsOptions } from '../skills/native-godskills-binding.mjs';

const PROTOCOL = 'eternities-native-pi-operator-v1';
const DIGEST = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const TOP = ['schemaVersion','protocolId','piPackageRoot','authPath','cwd','sessionRoot','admission','mission','model','grant','limits'];
const ADMISSION = ['receiptPath','creationDir','distributionDir','expectedPolicyDigest','expectedCreationBuildId','instanceId','creatorRef','transactionDir','journalPath','keelRoot'];
const MODEL = ['provider','id','maxTokens'];
const GRANT = ['allowedTools','maxToolCalls','expiresAt'];
const LIMITS = ['maxRunMs'];
const fail = code => { throw new Error(`native-operator:${code}`); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys, code='shape') => { if (!object(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code); };
const text = value => typeof value === 'string' && value.length > 0 && !/[\0\n\r]/u.test(value);
const path = value => text(value) && isAbsolute(value);
const boundedInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const noCredentials = value => {
  if (!object(value) && !Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (!['authPath','maxTokens'].includes(key) && /^(?:password?|secret|token|api[-_]?key|credential|bearer|authorization|authToken|apiKey)$/iu.test(key)) fail('credential-field');
    noCredentials(child);
  }
};

export function parseNativeOperatorArgs(argv = []) {
  if (!Array.isArray(argv)) fail('args');
  const commands = new Set(['preflight','launch','resume','status','history']);
  if (argv.length < 1 || !commands.has(argv[0])) fail('command');
  const result = { command: argv[0] }; const seen = new Set();
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i];
    const names = new Set(['--config','--pin','--prompt-file']);
    if (!names.has(flag)) fail('unknown-flag');
    if (seen.has(flag)) fail('duplicate-flag'); seen.add(flag);
    const value = argv[i + 1]; if (!text(value) || value.startsWith('--')) fail('flag-value');
    if (flag === '--config') result.configPath = value;
    if (flag === '--pin') result.expectedConfigDigest = value;
    if (flag === '--prompt-file') result.promptPath = value;
  }
  if (!path(result.configPath)) fail('config-path');
  if (!DIGEST.test(result.expectedConfigDigest ?? '')) fail('config-pin');
  if ((result.command === 'launch' || result.command === 'resume') && !path(result.promptPath)) fail('prompt-path');
  if (result.command !== 'launch' && result.command !== 'resume' && result.promptPath) fail('unexpected-prompt');
  return result;
}

export function validateNativeOperatorConfig(config) {
  noCredentials(config); exact(config, Object.hasOwn(config, 'godskills') ? [...TOP, 'godskills'] : TOP);
  if (config.schemaVersion !== 1 || config.protocolId !== PROTOCOL) fail('protocol');
  exact(config.admission, ADMISSION); exact(config.model, MODEL); exact(config.grant, GRANT);
  exact(config.limits, object(config.limits)&&Object.hasOwn(config.limits,'maxProviderRetries')?[...LIMITS,'maxProviderRetries']:LIMITS);
  for (const key of ['piPackageRoot','authPath','cwd','sessionRoot']) if (!path(config[key])) fail('path');
  for (const key of ['receiptPath','creationDir','distributionDir','transactionDir','journalPath','keelRoot']) if (!path(config.admission[key])) fail('admission-path');
  for (const key of ['expectedPolicyDigest','expectedCreationBuildId']) if (!DIGEST.test(config.admission[key] ?? '')) fail('admission-digest');
  for (const key of ['instanceId','creatorRef']) if (!text(config.admission[key])) fail('admission-identifier');
  if (!text(config.model.provider) || !text(config.model.id) || !boundedInt(config.model.maxTokens, 1, 500000)) fail('model');
  if (!Array.isArray(config.grant.allowedTools) || config.grant.allowedTools.length === 0 || new Set(config.grant.allowedTools).size !== config.grant.allowedTools.length || config.grant.allowedTools.some(tool => !Object.hasOwn(nativeToolEffects, tool))) fail('tools');
  if (!boundedInt(config.grant.maxToolCalls, 1, 10000) || !ISO.test(config.grant.expiresAt) || new Date(config.grant.expiresAt).toISOString() !== config.grant.expiresAt) fail('grant');
  if (!boundedInt(config.limits.maxRunMs, 1000, 86400000)) fail('limits');
  if (Object.hasOwn(config.limits,'maxProviderRetries')&&!boundedInt(config.limits.maxProviderRetries,0,2)) fail('limits');
  if (!object(config.mission)) fail('mission');
  if (Object.hasOwn(config, 'godskills')) {
    if (!object(config.godskills)) fail('godskills');
    validateNativeGodskillsOptions(config.godskills);
  }
  return config;
}

export async function loadNativeOperatorConfig({ configPath, expectedConfigDigest } = {}) {
  if (!path(configPath) || !DIGEST.test(expectedConfigDigest ?? '')) fail('config-pin');
  let information; try { information = await stat(configPath); } catch { fail('config-read'); }
  if (!information.isFile() || information.size > 1024 * 1024) fail('config-size');
  let value; try { value = JSON.parse(await readFile(configPath, 'utf8')); } catch { fail('config-json'); }
  if (sha256Value(value) !== expectedConfigDigest) fail('config-pin');
  return validateNativeOperatorConfig(value);
}
