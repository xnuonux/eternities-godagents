import { nativeOperatorRevocationEpoch } from './native-operator-binding-policy.mjs';
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

const HISTORY_ONLY = new Set(['settled','failed','incomplete']);
const HISTORY_LIMIT = /^(?:[1-9]\d{0,2}|1000)$/u;
const HISTORY_FLAGS = new Set(['--only','--after','--limit']);

export function parseNativeOperatorArgs(argv = []) {
  if (!Array.isArray(argv)) fail('args');
  if (argv[0] === 'prepare') {
    const result = { command: 'prepare' }, seen = new Set();
    const flags = { '--request': 'requestPath', '--pin': 'expectedRequestDigest', '--output': 'outputPath' };
    for (let i = 1; i < argv.length; i += 2) {
      const flag = argv[i], value = argv[i + 1];
      if (!Object.hasOwn(flags, flag)) fail('unknown-flag');
      if (seen.has(flag)) fail('duplicate-flag');
      seen.add(flag);
      if (!text(value) || value.startsWith('--')) fail('flag-value');
      result[flags[flag]] = value;
    }
    if (!path(result.requestPath) || !path(result.outputPath)) fail('preparation-path');
    if (!DIGEST.test(result.expectedRequestDigest ?? '')) fail('request-pin');
    return result;
  }
  const commands = new Set(['preflight','launch','resume','status','history','review']);
  if (argv.length < 1 || !commands.has(argv[0])) fail('command');
  const result = { command: argv[0] }; const seen = new Set(); const historyQuery = {};
  const names = new Set(['--config','--pin','--prompt-file', ...HISTORY_FLAGS]);
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!names.has(flag)) fail('unknown-flag');
    if (HISTORY_FLAGS.has(flag) && result.command !== 'history') fail('unknown-flag');
    if (seen.has(flag)) fail('duplicate-flag'); seen.add(flag);
    const value = argv[i + 1]; if (!text(value) || value.startsWith('--')) fail('flag-value');
    if (flag === '--config') result.configPath = value;
    if (flag === '--pin') result.expectedConfigDigest = value;
    if (flag === '--prompt-file') result.promptPath = value;
    if (flag === '--only') {
      if (!HISTORY_ONLY.has(value)) fail('flag-value');
      historyQuery.only = value;
    }
    if (flag === '--after') {
      if (!ISO.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('flag-value');
      historyQuery.after = value;
    }
    if (flag === '--limit') {
      if (!HISTORY_LIMIT.test(value)) fail('flag-value');
      historyQuery.limit = Number(value);
    }
  }
  if (!path(result.configPath)) fail('config-path');
  if (!DIGEST.test(result.expectedConfigDigest ?? '')) fail('config-pin');
  if (['launch','resume','review'].includes(result.command) && !path(result.promptPath)) fail('prompt-path');
  if (!['launch','resume','review'].includes(result.command) && result.promptPath) fail('unexpected-prompt');
  if (Object.keys(historyQuery).length) result.historyQuery = historyQuery;
  return result;
}

export function validateNativePreparationRequest(request) {
  exact(request, [...TOP.filter(key => key !== 'admission'), 'admissionRoot', 'expectedBindingDigest',
    ...['godskills','revocationEpoch'].filter(key => object(request) && Object.hasOwn(request, key))], 'preparation-shape');
  if (request.schemaVersion !== 1 || request.protocolId !== 'eternities-native-pi-preparation-v1') fail('preparation-protocol');
  nativeOperatorRevocationEpoch(request);
  if (!path(request.admissionRoot)) fail('preparation-path');
  if (!DIGEST.test(request.expectedBindingDigest ?? '')) fail('admission-pin');
  return request;
}

export async function loadNativePreparationRequest({ requestPath, expectedRequestDigest } = {}) {
  if (!path(requestPath) || !DIGEST.test(expectedRequestDigest ?? '')) fail('request-pin');
  let information; try { information = await stat(requestPath); } catch { fail('request-read'); }
  if (!information.isFile() || information.size > 1024 * 1024) fail('request-size');
  let value; try { value = JSON.parse(await readFile(requestPath, 'utf8')); } catch { fail('request-json'); }
  if (sha256Value(value) !== expectedRequestDigest) fail('request-pin');
  return validateNativePreparationRequest(value);
}

export function validateNativeOperatorConfig(config) {
  noCredentials(config); exact(config,[...TOP,...['godskills','review','revocationEpoch'].filter(key=>Object.hasOwn(config,key))]);
  if (config.schemaVersion !== 1 || config.protocolId !== PROTOCOL) fail('protocol');
  nativeOperatorRevocationEpoch(config);
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
  if(Object.hasOwn(config,'review')) {
    exact(config.review,['snapshotPath','snapshotDigest','maxCompletionTokens'],'review-profile');
    if(!path(config.review.snapshotPath)||!DIGEST.test(config.review.snapshotDigest??'')
      ||!boundedInt(config.review.maxCompletionTokens,config.model.maxTokens,1000000)
      ||config.review.maxCompletionTokens>config.mission.budget?.maxCompletionTokens)fail('review-profile');
    if(config.grant.allowedTools.length!==1||config.grant.allowedTools[0]!=='read')fail('review-tools');
    if(Object.hasOwn(config,'godskills'))fail('review-selection-unsupported');
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
