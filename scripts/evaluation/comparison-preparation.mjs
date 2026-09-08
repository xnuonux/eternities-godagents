import { basename, dirname, join } from 'node:path';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { captureComparisonFiles } from './comparison-files.mjs';
import { bindComparisonEnvelope } from './comparison-envelope.mjs';

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
