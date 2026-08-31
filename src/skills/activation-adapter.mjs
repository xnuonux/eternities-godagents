import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';

const protocolId = 'eternities-godskills-activation-v1';
const digestPattern = /^[a-f0-9]{64}$/;
const capabilityIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const taskClasses = new Set([
  'creative-generation', 'debugging-recovery', 'implementation', 'research',
  'continuity', 'verification', 'general',
]);
const consequenceClasses = new Set(['low', 'consequential', 'critical']);
const riskClasses = new Set(['low', 'moderate', 'high']);
const evidenceClasses = new Set(['unverified', 'inferred', 'verified']);
const modes = new Set(['native', 'guardrail', 'method', 'review']);
const disclosures = Object.freeze({
  native: 'none',
  guardrail: 'guardrails-only',
  method: 'entrypoint-and-contract',
  review: 'none',
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function frozenClone(value) {
  return deepFreeze(structuredClone(value));
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, keys, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are invalid`);
  }
}

function nonEmptyString(value, label, { singleLine = false } = {}) {
  if (typeof value !== 'string' || value.length === 0
      || value.includes('\0') || (singleLine && /[\r\n]/.test(value))) {
    throw new TypeError(`${label} must be a non-empty${singleLine ? ' single-line' : ''} string`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
}

function requireCapabilityId(value, label) {
  if (typeof value !== 'string' || !capabilityIdPattern.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
}

function stringSet(value, label, { sorted = false } = {}) {
  if (!Array.isArray(value)
      || value.some((entry) => typeof entry !== 'string' || entry.length === 0 || /[\0\r\n]/.test(entry))) {
    throw new TypeError(`${label} must be a string array`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must contain unique values`);
  if (sorted && canonicalJson(value) !== canonicalJson([...value].sort())) {
    throw new Error(`${label} must be sorted`);
  }
  return value;
}

function validateAuthority(value) {
  exactKeys(value, [
    'availableAuthority', 'permittedEffects', 'availablePreconditions',
    'maximumRisk', 'minimumEvidenceConfidence', 'contextBudget',
  ], 'activation authority projection');
  stringSet(value.availableAuthority, 'activation available authority', { sorted: true });
  stringSet(value.permittedEffects, 'activation permitted effects', { sorted: true });
  stringSet(value.availablePreconditions, 'activation available preconditions', { sorted: true });
  if (!riskClasses.has(value.maximumRisk)) throw new Error('activation maximum risk is invalid');
  if (!evidenceClasses.has(value.minimumEvidenceConfidence)) {
    throw new Error('activation minimum evidence confidence is invalid');
  }
  if (!Number.isInteger(value.contextBudget) || value.contextBudget < 0) {
    throw new TypeError('activation context budget must be a non-negative integer');
  }
  return value;
}

function validateClassification(value) {
  exactKeys(value, ['taskClass', 'consequenceClass', 'reviewAvailable'], 'activation classification');
  if (!taskClasses.has(value.taskClass)
      || !consequenceClasses.has(value.consequenceClass)
      || typeof value.reviewAvailable !== 'boolean') {
    throw new Error('activation classification is invalid');
  }
  return value;
}

function validateSelectedArtifacts(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new Error('activation requires one to three selected capabilities');
  }
  const identities = new Set();
  for (const row of value) {
    exactKeys(row, ['id', 'entrypointSha256', 'contractSha256'], 'selected capability artifact');
    requireCapabilityId(row.id, 'selected capability identity');
    requireDigest(row.entrypointSha256, 'selected entrypoint digest');
    requireDigest(row.contractSha256, 'selected contract digest');
    if (identities.has(row.id)) throw new Error('selected capability identities must be unique');
    identities.add(row.id);
  }
  return value;
}

function prepareInputs({ mission, selected, authority } = {}) {
  object(mission, 'activation mission');
  nonEmptyString(mission.requestId, 'activation mission request id', { singleLine: true });
  nonEmptyString(mission.text, 'activation mission text');
  validateSelectedArtifacts(selected);
  validateAuthority(authority);

  const explicit = mission.explicitMethodRequests ?? [];
  stringSet(explicit, 'activation explicit method requests');
  const selectedIds = new Set(selected.map(({ id }) => id));
  for (const id of explicit) {
    requireCapabilityId(id, 'activation explicit method request identity');
    if (!selectedIds.has(id)) {
      throw new Error('activation explicit method request must refer to a selected capability');
    }
  }
  return { mission, selected, authority, explicit: new Set(explicit) };
}

function requestIdentity({ mission, selected }) {
  return `godagent-activation-${sha256(canonicalJson({
    mission: { requestId: mission.requestId, text: mission.text },
    selected: selected.map(({ id, entrypointSha256, contractSha256 }) => ({
      id, entrypointSha256, contractSha256,
    })),
  }))}`;
}

function buildRequest(inputs, classification, activation) {
  return deepFreeze({
    schemaVersion: 1,
    protocolId: activation.protocolId,
    requestId: requestIdentity(inputs),
    trustRootDigest: activation.trustRootDigest,
    classification: structuredClone(classification),
    selected: inputs.selected.map(({ id }) => ({
      selectedId: id,
      explicitMethodRequest: inputs.explicit.has(id),
    })),
    authorityProjection: structuredClone(inputs.authority),
  });
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
}

function validateMethodEvidence(value) {
  exactKeys(value, [
    'eligible', 'matchedEvaluations', 'wins', 'losses', 'ties', 'winRate',
    'criticalRegressions', 'overheadRatio', 'failedGates',
  ], 'activation method evidence');
  if (typeof value.eligible !== 'boolean') throw new TypeError('activation method evidence eligibility is invalid');
  for (const field of ['matchedEvaluations', 'wins', 'losses', 'ties', 'criticalRegressions']) {
    nonNegativeInteger(value[field], `activation method evidence ${field}`);
  }
  if (value.wins + value.losses + value.ties !== value.matchedEvaluations) {
    throw new Error('activation method evidence totals are contradictory');
  }
  const rate = value.matchedEvaluations === 0 ? 0 : value.wins / value.matchedEvaluations;
  if (typeof value.winRate !== 'number' || !Number.isFinite(value.winRate) || value.winRate !== rate) {
    throw new Error('activation method evidence win rate is contradictory');
  }
  if (value.overheadRatio !== null
      && (typeof value.overheadRatio !== 'number'
        || !Number.isFinite(value.overheadRatio) || value.overheadRatio <= 0)) {
    throw new TypeError('activation method evidence overhead ratio is invalid');
  }
  stringSet(value.failedGates, 'activation method evidence failed gates');
  if (value.eligible !== (value.failedGates.length === 0)) {
    throw new Error('activation method evidence eligibility is contradictory');
  }
}

function validateDecision(value, request, index, activation) {
  exactKeys(value, [
    'schemaVersion', 'selectedId', 'taskClass', 'consequenceClass', 'mode', 'reasonCodes',
    'preInferenceDisclosure', 'deferredReview', 'methodEvidence', 'policyDigest', 'evidenceDigest',
    'authorityProjection', 'authorityExpanded', 'decisionDigest',
  ], 'activation decision');
  if (value.schemaVersion !== 1) throw new Error('activation decision schema version is invalid');
  if (value.selectedId !== request.selected[index].selectedId) {
    throw new Error('activation decision order or selected identity mismatch');
  }
  if (value.taskClass !== request.classification.taskClass
      || value.consequenceClass !== request.classification.consequenceClass) {
    throw new Error('activation decision classification mismatch');
  }
  if (!modes.has(value.mode)) throw new Error('activation decision mode is invalid');
  stringSet(value.reasonCodes, 'activation decision reason codes');
  if (value.reasonCodes.length === 0) throw new Error('activation decision reason codes are required');
  if (value.preInferenceDisclosure !== disclosures[value.mode]
      || value.deferredReview !== (value.mode === 'review')) {
    throw new Error('activation decision disclosure is incoherent');
  }
  validateMethodEvidence(value.methodEvidence);
  if (value.policyDigest !== activation.policy.logicalDigest) {
    throw new Error('activation decision policy digest mismatch');
  }
  if (value.evidenceDigest !== activation.evidence.logicalDigest) {
    throw new Error('activation decision evidence digest mismatch');
  }
  validateAuthority(value.authorityProjection);
  if (!same(value.authorityProjection, request.authorityProjection)) {
    throw new Error('activation decision authority mismatch');
  }
  if (value.authorityExpanded !== false) throw new Error('activation decision expanded authority');
  requireDigest(value.decisionDigest, 'activation decision digest');
  const unsigned = structuredClone(value);
  delete unsigned.decisionDigest;
  if (sha256(canonicalJson(unsigned)) !== value.decisionDigest) {
    throw new Error('activation decision digest mismatch');
  }
}

function validateResult(value, request, activation) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'requestId', 'requestDigest', 'trustRootDigest',
    'policyDigest', 'evidenceDigest', 'classification', 'decisions', 'resultDigest',
  ], 'activation result');
  if (value.schemaVersion !== 1 || value.protocolId !== activation.protocolId) {
    throw new Error('activation result protocol is unsupported');
  }
  if (value.trustRootDigest !== activation.trustRootDigest) {
    throw new Error('activation result trust root mismatch');
  }
  if (value.requestId !== request.requestId) throw new Error('activation request identity mismatch');
  requireDigest(value.requestDigest, 'activation request digest');
  if (value.requestDigest !== sha256(canonicalJson(request))) {
    throw new Error('activation request digest mismatch');
  }
  if (value.policyDigest !== activation.policy.logicalDigest) {
    throw new Error('activation result policy digest mismatch');
  }
  if (value.evidenceDigest !== activation.evidence.logicalDigest) {
    throw new Error('activation result evidence digest mismatch');
  }
  validateClassification(value.classification);
  if (!same(value.classification, request.classification)) {
    throw new Error('activation result classification echo mismatch');
  }
  if (!Array.isArray(value.decisions)
      || value.decisions.length < 1 || value.decisions.length > 3
      || value.decisions.length !== request.selected.length) {
    throw new Error('activation decision count mismatch');
  }
  value.decisions.forEach((decision, index) => validateDecision(decision, request, index, activation));
  requireDigest(value.resultDigest, 'activation result digest');
  const unsigned = structuredClone(value);
  delete unsigned.resultDigest;
  if (sha256(canonicalJson(unsigned)) !== value.resultDigest) {
    throw new Error('activation result digest mismatch');
  }
  return frozenClone(value);
}

function validateVerifiedActivation(value) {
  object(value, 'verified Godskills activation');
  if (value.protocolId !== protocolId) throw new Error('verified Godskills activation protocol is unsupported');
  requireDigest(value.trustRootDigest, 'verified Godskills activation trust root');
  object(value.policy, 'verified Godskills activation policy');
  object(value.evidence, 'verified Godskills activation evidence');
  requireDigest(value.policy.logicalDigest, 'verified Godskills activation policy digest');
  requireDigest(value.evidence.logicalDigest, 'verified Godskills activation evidence digest');
  return frozenClone(value);
}

export function createGodskillsActivationAdapter({ verifiedActivation, classifier, transport } = {}) {
  const activation = validateVerifiedActivation(verifiedActivation);
  if (typeof classifier !== 'function') throw new TypeError('Godskills activation classifier must be a function');
  if (typeof transport !== 'function') throw new TypeError('Godskills activation transport must be a function');

  return Object.freeze({
    trustRootDigest: activation.trustRootDigest,
    async compile(input) {
      const inputs = prepareInputs(input);
      const projection = deepFreeze({
        mission: { requestId: inputs.mission.requestId, text: inputs.mission.text },
        selected: inputs.selected.map(({ id }) => ({ id })),
      });
      const classification = frozenClone(validateClassification(await classifier(projection)));
      const request = buildRequest(inputs, classification, activation);
      return validateResult(await transport(request), request, activation);
    },
    rehydrate({ binding, ...input } = {}) {
      object(binding, 'activation binding');
      if (binding.trustRootDigest !== activation.trustRootDigest) {
        throw new Error('activation binding trust root mismatch');
      }
      const inputs = prepareInputs(input);
      const classification = frozenClone(validateClassification(binding.classification));
      const request = buildRequest(inputs, classification, activation);
      return validateResult(binding, request, activation);
    },
  });
}

function minimalChildEnvironment() {
  const environment = {};
  if (typeof process.env.SystemRoot === 'string') environment.SystemRoot = process.env.SystemRoot;
  if (typeof process.env.WINDIR === 'string') environment.WINDIR = process.env.WINDIR;
  return environment;
}

function runNode(args, cwd, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: minimalChildEnvironment(),
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    child.once('error', (error) => finish(new Error(`Godskills activation process failed: ${error.message}`, { cause: error })));
    child.once('close', (code) => {
      if (timedOut) finish(new Error(`Godskills activation process timed out after ${timeoutMs}ms`));
      else if (code !== 0) finish(new Error(`Godskills activation process exited with code ${code}`));
      else finish();
    });
  });
}

function environmentScrubbingArguments(entrypoint, argumentsAfterEntrypoint) {
  const entrypointUrl = pathToFileURL(entrypoint).href;
  const bootstrap = `
const allowed = new Set(['SYSTEMROOT', 'WINDIR']);
for (const name of Object.keys(process.env)) {
  if (!allowed.has(name.toUpperCase())) delete process.env[name];
}
await import(${JSON.stringify(entrypointUrl)});
`;
  return [
    '--input-type=module', '--eval', bootstrap, '--', entrypoint,
    ...argumentsAfterEntrypoint,
  ];
}

function requireContained(root, target, label) {
  const relation = relative(root, target);
  if (relation.length > 0 && !relation.startsWith('..') && !isAbsolute(relation)) return;
  throw new Error(`${label} escaped its required root`);
}

export function createLocalGodskillsActivationTransport({
  verifiedActivation,
  timeoutMs = 30_000,
  maximumResultBytes = 1_048_576,
} = {}) {
  const activation = validateVerifiedActivation(verifiedActivation);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new TypeError('Godskills activation timeout must be an integer from 1 to 120000 milliseconds');
  }
  if (!Number.isInteger(maximumResultBytes) || maximumResultBytes < 1 || maximumResultBytes > 16_777_216) {
    throw new TypeError('Godskills activation result byte ceiling is invalid');
  }
  nonEmptyString(activation.root, 'verified Godskills activation root', { singleLine: true });
  nonEmptyString(activation.entrypoint?.absolutePath, 'verified Godskills activation entrypoint', { singleLine: true });
  nonEmptyString(activation.executableReceipt?.path, 'verified Godskills activation receipt', { singleLine: true });
  const root = resolve(activation.root);
  const entrypoint = resolve(activation.entrypoint.absolutePath);
  const receipt = resolve(root, activation.executableReceipt.path);
  requireContained(root, entrypoint, 'Godskills activation entrypoint');
  requireContained(root, receipt, 'Godskills activation receipt');
  const temporaryRoot = resolve(tmpdir());

  return async function localGodskillsActivationTransport(request) {
    const workspace = await mkdtemp(join(temporaryRoot, 'godagent-activation-'));
    requireContained(temporaryRoot, resolve(workspace), 'Godskills activation workspace');
    const requestPath = join(workspace, 'request.json');
    const outputPath = join(workspace, 'result.json');
    try {
      await Promise.all([access(entrypoint), access(receipt)]);
      await writeFile(requestPath, `${canonicalJson(request)}\n`, { encoding: 'utf8', flag: 'wx' });
      await runNode(environmentScrubbingArguments(entrypoint, [
        '--request', requestPath,
        '--output', outputPath,
        '--receipt', receipt,
      ]), root, timeoutMs);
      let outputStat;
      try {
        outputStat = await lstat(outputPath);
      } catch (error) {
        if (error?.code === 'ENOENT') throw new Error('Godskills activation output is missing');
        throw error;
      }
      if (!outputStat.isFile()) throw new Error('Godskills activation output must be a regular file');
      if (outputStat.size > maximumResultBytes) {
        throw new Error(`Godskills activation output exceeds the ${maximumResultBytes} byte ceiling`);
      }
      const bytes = await readFile(outputPath);
      if (bytes.length > maximumResultBytes) {
        throw new Error(`Godskills activation output exceeds the ${maximumResultBytes} byte ceiling`);
      }
      try {
        return JSON.parse(bytes.toString('utf8'));
      } catch (error) {
        throw new Error('Godskills activation output is invalid JSON', { cause: error });
      }
    } finally {
      requireContained(temporaryRoot, resolve(workspace), 'Godskills activation cleanup target');
      await rm(workspace, { recursive: true, force: true });
    }
  };
}
