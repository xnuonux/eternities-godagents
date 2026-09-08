import { basename, dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value, sha256Text } from '../../src/core/digest.mjs';
import { captureComparisonFiles } from './comparison-files.mjs';
import { bindComparisonEnvelope } from './comparison-envelope.mjs';
import { loadIdentityHostPolicy, verifyIdentityHostPolicyRouting } from '../../src/host/identity-policy.mjs';
import { verifyIdentityHostRequest } from '../../src/host/admitted-sealed-identity-launch.mjs';
import { loadOpenAICompatiblePhaseTransportPolicy } from '../../src/transports/openai-compatible-phase-policy.mjs';
import { buildIdentityBoundNativeTransportDescriptor } from '../../src/runtime/identity-bound-native-contracts.mjs';

const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
const digest = /^[a-f0-9]{64}$/;
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) throw new Error('comparison preparation fields invalid');
}
function parse(file) {
  const text = Buffer.from(file.base64, 'base64').toString('utf8');
  const value = JSON.parse(text);
  if (`${canonicalJson(value)}\n` !== text) throw new Error('comparison workflow input is not canonical');
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Read-only input inspection for preparation. This is neither a ready record nor
// admission/authority validation. The authenticated host remains responsible for
// validating the full identity, policy, source closure and recovered state.
export async function inspectPreparedComparison(input) {
  exact(input, ['workflow', 'task', 'baseline', 'allocations']);
  const { workflow, task, baseline, allocations } = structuredClone(input);
  const [manifestFile] = await captureComparisonFiles([workflow]);
  if (basename(manifestFile.path) !== 'workflow.json') throw new Error('comparison requires a workflow manifest');
  const manifest = parse(manifestFile);
  exact(manifest, ['schemaVersion', 'status', 'workspaceRoot', 'family', 'instanceId', 'missionId', 'genesisId', 'identityPolicyDigest', 'inputs']);
  exact(manifest.inputs, ['providerPolicy', 'identityPolicy', 'mission']);
  const root = dirname(manifestFile.path);
  if (manifest.schemaVersion !== 2 || manifest.status !== 'prepared'
      || manifest.family !== 'openai-compatible-chat-completions-v1'
      || typeof manifest.workspaceRoot !== 'string' || pathKey(manifest.workspaceRoot) !== pathKey(root)
      || !digest.test(manifest.identityPolicyDigest ?? '')
      || ['instanceId', 'missionId', 'genesisId'].some(key => typeof manifest[key] !== 'string' || !manifest[key])) {
    throw new Error('comparison workflow manifest is invalid');
  }
  const names = { providerPolicy: 'provider-policy.json', identityPolicy: 'identity-policy.json', mission: 'mission-request.json' };
  const files = await captureComparisonFiles(Object.entries(names).map(([key, name]) => ({ path: join(root, name), sha256: manifest.inputs[key] })));
  const [providerPolicy, identityPolicy, mission] = files.map(parse);
  if (identityPolicy.schemaVersion !== 2 || identityPolicy.runtime?.instanceId !== manifest.instanceId
      || mission.mission?.missionId !== manifest.missionId
      || sha256Value(identityPolicy) !== manifest.identityPolicyDigest) throw new Error('comparison workflow identity binding differs');
  const envelope = bindComparisonEnvelope({ task, providerPolicy, baseline, mission, allocations });
  return freeze({ manifest, providerPolicy, identityPolicy, mission, envelope, files: [manifestFile, ...files] });
}

// Validate actual policy/request semantics and pinned routing executables. Still
// inert: no readiness publication, credentials, admission launch or inference.
export async function verifyPreparedComparison(input) {
  const inspected = await inspectPreparedComparison(input);
  const root = inspected.manifest.workspaceRoot;
  const loaded = await loadIdentityHostPolicy(join(root, 'identity-policy.json'));
  if (loaded.digest !== inspected.manifest.identityPolicyDigest) throw new Error('comparison identity policy changed during verification');
  verifyIdentityHostRequest(loaded.policy, inspected.mission);
  const provider = await loadOpenAICompatiblePhaseTransportPolicy({ path: join(root, 'provider-policy.json'),
    env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: sha256Value(inspected.providerPolicy) } });
  if (provider.digest !== sha256Value(inspected.providerPolicy)) throw new Error('comparison provider policy changed');
  const native = buildIdentityBoundNativeTransportDescriptor({ transportId: `openai-compatible-native:${provider.digest}`,
    maximumDispatchBytes: provider.policy.phases.native.maximumDispatchBytes,
    maximumCompletionBytes: provider.policy.phases.native.maximumCompletionBytes });
  if (canonicalJson(native) !== canonicalJson(loaded.policy.runtime.nativeTransport)) throw new Error('comparison native transport differs from provider policy');
  await verifyIdentityHostPolicyRouting(loaded.policy);
  // The existing validators read paths. Check the original byte pins again
  // after they finish; do not silently replace the captured preparation input.
  await captureComparisonFiles(inspected.files.map(({ path, sha256 }) => ({ path, sha256 })));
  return inspected;
}

function contains(parent, child) {
  const difference = relative(pathKey(parent), pathKey(child));
  return difference === '' || (!difference.startsWith('..') && !isAbsolute(difference));
}

// An inert, separately pinned preregistration. Captured source is never loaded.
// A runner must still recognize the oracle from its fixed registry, verify its
// own source bindings and obtain execution authority. Preparation grants none.
export async function prepareComparison(input) {
  exact(input, ['directory', 'preregistration', 'expectedDigest']);
  const { directory, preregistration, expectedDigest } = structuredClone(input);
  if (typeof directory !== 'string' || !isAbsolute(directory) || /[\0\r\n]/.test(directory)) throw new Error('comparison directory invalid');
  exact(preregistration, ['schemaVersion', 'comparison', 'armOrder', 'sources', 'oracle']);
  const registrationText = canonicalJson(preregistration);
  if (Buffer.byteLength(registrationText) > 1_048_576 || !digest.test(expectedDigest ?? '')
      || sha256Text(registrationText) !== expectedDigest) throw new Error('comparison preregistration digest invalid');
  exact(preregistration.oracle, ['id', 'source']);
  if (preregistration.schemaVersion !== 1 || !/^[a-z][a-z0-9-]{0,63}$/.test(preregistration.oracle.id ?? '')
      || !['["baseline","godagent"]', '["godagent","baseline"]'].includes(canonicalJson(preregistration.armOrder))) throw new Error('comparison preregistration protocol invalid');
  const target = resolve(directory);
  const parent = dirname(target);
  if (pathKey(await realpath(parent)) !== pathKey(parent)) throw new Error('comparison directory parent aliased');
  try { await lstat(target); throw new Error('comparison directory occupied'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const workspace = dirname(resolve(preregistration.comparison?.workflow?.path ?? ''));
  if (contains(workspace, target) || contains(target, workspace)) throw new Error('comparison and workflow locations overlap');
  const inspected = await verifyPreparedComparison(preregistration.comparison);
  if (!Array.isArray(preregistration.sources) || preregistration.sources.length < 1) throw new Error('comparison source pins missing');
  const sources = await captureComparisonFiles([...preregistration.sources, preregistration.oracle.source]);
  if (sources.some(file => contains(target, file.path))) throw new Error('comparison output overlaps source');
  const record = { schemaVersion: 1, protocolId: 'eternities-comparison-preparation-v1', status: 'prepared', executionAuthorized: false,
    directory: target, preregistrationDigest: expectedDigest, preregistration, inspected, sources };
  const text = `${canonicalJson(record)}\n`;
  if (Buffer.byteLength(text) > 12_582_912) throw new Error('comparison preparation record exceeds bound');
  // Exclusive ownership. A failed publication remains a failed attempt and is
  // never cleaned up automatically or retried into the same directory.
  await mkdir(target, { mode: 0o700 });
  const preparationPath = join(target, 'comparison.json');
  const file = await open(preparationPath, 'wx', 0o600);
  try { await file.writeFile(text, 'utf8'); await file.sync(); }
  finally { await file.close(); }
  return Object.freeze({ preparationPath, preparationDigest: sha256Text(text) });
}
