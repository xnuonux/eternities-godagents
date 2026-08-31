import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { AuthorityError } from '../core/errors.mjs';

const statuses = new Set(['selected', 'needs-decision', 'no-qualified-route']);
const entrypointPattern = /^skills\/([a-z0-9-]+)\/SKILL\.md$/;
const riskRank = new Map(['low', 'moderate', 'high', 'critical'].map((value, index) => [value, index]));
const evidenceRank = new Map(['verified', 'high', 'medium', 'low'].map((value, index) => [value, index]));
const preferenceProtocol = 'eternities-godskills-specialist-preference-v1';
const preferenceDecisionPolicy =
  'coverage>card-count>extra-capabilities>effects>context>dependencies>evidence>preference>id';
const preferenceReasons = new Set([
  'equal-quality-tie-break',
  'selected-without-effect',
  'stronger-nonpreferred-selection',
  'preference-not-route-capable',
  'preference-not-semantic-candidate',
  'no-qualified-preference',
  'no-selection',
  'unresolved-decision',
]);

const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  if (canonicalJson(actual) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function equalArrays(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function validatedPreference(preference) {
  if (preference === undefined || preference === null) return null;
  exactKeys(preference, ['protocolId', 'preferredCapabilities'], 'Godskills preference request');
  if (preference.protocolId !== preferenceProtocol) throw new Error('Godskills preference protocol is unsupported');
  const ids = preference.preferredCapabilities;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 32
      || ids.some((id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id))
      || new Set(ids).size !== ids.length
      || !equalArrays(ids, [...ids].sort())) {
    throw new Error('Godskills preferred capabilities must be sorted unique portable ids');
  }
  return Object.freeze({
    protocolId: preference.protocolId,
    preferredCapabilities: Object.freeze([...ids]),
  });
}

function normalizedContext(hostContext, preference) {
  const context = {
    permittedEffects: uniqueSorted(hostContext.permittedEffects),
    availableAuthority: uniqueSorted(hostContext.availableAuthority),
    availablePreconditions: uniqueSorted(hostContext.availablePreconditions),
    forbiddenCapabilities: uniqueSorted(hostContext.forbiddenCapabilities),
    maximumRisk: hostContext.maximumRisk,
    minimumEvidenceConfidence: hostContext.minimumEvidenceConfidence,
    contextBudget: hostContext.contextBudget,
    maxCompositionSize: hostContext.maxCompositionSize,
  };
  if (preference !== null) context.preferredCapabilities = [...preference.preferredCapabilities];
  return context;
}

function requireSubset(actual, available, kind) {
  const allowed = new Set(available);
  for (const value of actual) {
    if (!allowed.has(value)) {
      throw new AuthorityError(`Godskills compiler attempted to expand ${kind}`);
    }
  }
}

function requireNoScalarExpansion(actual, ceiling, ranks, kind) {
  if (!ranks.has(actual) || !ranks.has(ceiling) || ranks.get(actual) > ranks.get(ceiling)) {
    throw new AuthorityError(`Godskills compiler attempted to expand ${kind}`);
  }
}

function validatePreferenceResult({ compilerReceipt, routeReceipt, expected, naturalRequest }) {
  const ids = expected.preferredCapabilities;
  if (!equalArrays(compilerReceipt.envelope.preferredCapabilities, ids)
      || !equalArrays(routeReceipt.requestFeatures?.preferredCapabilities, ids)) {
    throw new Error('Godskills preference echo does not match the verified request');
  }
  if (compilerReceipt.requestDigest !== sha256Value(naturalRequest)) {
    throw new Error('Godskills preference compiler request digest mismatch');
  }
  if (routeReceipt.requestDigest !== sha256Value(compilerReceipt.envelope)) {
    throw new Error('Godskills preference route request digest mismatch');
  }
  if (routeReceipt.decisionPolicy !== preferenceDecisionPolicy) {
    throw new Error('Godskills preference decision policy mismatch');
  }
  const record = routeReceipt.preference;
  exactKeys(record, [
    'protocolId', 'suppliedIds', 'qualifiedIds', 'selectedIds',
    'baselineSelectedIds', 'semanticCandidateIds', 'applied', 'reason',
  ], 'Godskills preference receipt');
  if (record.protocolId !== expected.protocolId || !equalArrays(record.suppliedIds, ids)) {
    throw new Error('Godskills preference receipt root or supplied ids mismatch');
  }
  for (const [label, values] of Object.entries({
    qualifiedIds: record.qualifiedIds,
    selectedIds: record.selectedIds,
    baselineSelectedIds: record.baselineSelectedIds,
    semanticCandidateIds: record.semanticCandidateIds,
    candidateIds: routeReceipt.candidateIds,
  })) {
    if (!Array.isArray(values) || new Set(values).size !== values.length
        || !equalArrays(values, [...values].sort())) {
      throw new Error(`Godskills preference ${label} must be sorted and unique`);
    }
  }
  if (!equalArrays(record.selectedIds, routeReceipt.selectedIds)) {
    throw new Error('Godskills preference selected ids do not match the route');
  }
  const candidates = new Set(routeReceipt.candidateIds);
  const supplied = new Set(record.suppliedIds);
  const qualified = new Set(record.qualifiedIds);
  const semantic = new Set(record.semanticCandidateIds);
  for (const id of record.suppliedIds) {
    if (!candidates.has(id)) throw new Error('Godskills supplied preference is not a candidate');
  }
  for (const id of record.qualifiedIds) {
    if (!supplied.has(id) || !candidates.has(id)) {
      throw new Error('Godskills qualified preference is inconsistent');
    }
  }
  for (const id of record.semanticCandidateIds) {
    if (!candidates.has(id)) throw new Error('Godskills semantic preference candidate is unknown');
  }
  for (const id of [...record.selectedIds, ...record.baselineSelectedIds]) {
    if (!semantic.has(id)) throw new Error('Godskills preference selection escaped semantic candidates');
    if (supplied.has(id) && !qualified.has(id)) {
      throw new Error('Godskills selected preference was not qualified');
    }
  }
  if (typeof record.applied !== 'boolean' || !preferenceReasons.has(record.reason)) {
    throw new Error('Godskills preference disposition is invalid');
  }
  const changed = !equalArrays(record.selectedIds, record.baselineSelectedIds);
  if (record.applied !== changed || record.applied !== (record.reason === 'equal-quality-tie-break')) {
    throw new Error('Godskills preference application contradicts its selections');
  }
  if (record.reason === 'equal-quality-tie-break') {
    const selectedPreferred = record.selectedIds.filter((id) => supplied.has(id)).length;
    const baselinePreferred = record.baselineSelectedIds.filter((id) => supplied.has(id)).length;
    if (selectedPreferred <= baselinePreferred) throw new Error('Godskills preference moved in the wrong direction');
  }
  if (routeReceipt.status === 'needs-decision') {
    if (record.reason !== 'unresolved-decision' || record.selectedIds.length > 0
        || record.baselineSelectedIds.length > 0) {
      throw new Error('Godskills unresolved preference result is inconsistent');
    }
  } else if (routeReceipt.status === 'no-qualified-route') {
    if (record.reason !== 'no-selection' || record.selectedIds.length > 0
        || record.baselineSelectedIds.length > 0) {
      throw new Error('Godskills no-route preference result is inconsistent');
    }
  } else if (record.reason === 'no-selection' || record.reason === 'unresolved-decision') {
    throw new Error('Godskills selected preference result has a terminal-only reason');
  } else if (record.reason === 'selected-without-effect') {
    if (changed || !record.selectedIds.some((id) => supplied.has(id))) {
      throw new Error('Godskills selected-without-effect preference result is inconsistent');
    }
  } else if (record.reason === 'stronger-nonpreferred-selection') {
    if (changed || !record.qualifiedIds.some((id) => semantic.has(id))
        || record.selectedIds.some((id) => supplied.has(id))) {
      throw new Error('Godskills stronger nonpreferred result is inconsistent');
    }
  } else if (record.reason === 'preference-not-route-capable') {
    if (changed || !record.qualifiedIds.some((id) => semantic.has(id))
        || record.selectedIds.some((id) => supplied.has(id))) {
      throw new Error('Godskills non-route-capable preference result is inconsistent');
    }
  } else if (record.reason === 'preference-not-semantic-candidate') {
    if (changed || record.qualifiedIds.length === 0
        || record.qualifiedIds.some((id) => semantic.has(id))
        || record.selectedIds.some((id) => supplied.has(id))) {
      throw new Error('Godskills non-semantic preference result is inconsistent');
    }
  } else if (record.reason === 'no-qualified-preference') {
    if (changed || record.qualifiedIds.length !== 0) {
      throw new Error('Godskills no-qualified preference result is inconsistent');
    }
  }
}

function validateRouteResult(result, requestId, context, expectedPreference, naturalRequest) {
  if (!result || typeof result !== 'object' || !result.compilerReceipt || !result.routeReceipt) {
    throw new Error('route receipt result is incomplete');
  }
  const { compilerReceipt, routeReceipt } = result;
  if (compilerReceipt.requestId !== requestId || routeReceipt.requestId !== requestId) {
    throw new Error('route receipt request identity does not match');
  }
  if (!compilerReceipt.envelope || !Array.isArray(compilerReceipt.envelope.availableAuthority)
      || !Array.isArray(compilerReceipt.envelope.permittedEffects)) {
    throw new Error('route receipt compiler envelope is incomplete');
  }
  requireSubset(compilerReceipt.envelope.availableAuthority, context.availableAuthority, 'authority');
  requireSubset(compilerReceipt.envelope.permittedEffects, context.permittedEffects, 'effects');
  requireSubset(compilerReceipt.envelope.availablePreconditions, context.availablePreconditions, 'preconditions');
  requireSubset(context.forbiddenCapabilities, compilerReceipt.envelope.forbiddenCapabilities, 'forbidden capability policy');
  requireNoScalarExpansion(compilerReceipt.envelope.maximumRisk, context.maximumRisk, riskRank, 'risk');
  requireNoScalarExpansion(compilerReceipt.envelope.minimumEvidenceConfidence, context.minimumEvidenceConfidence, evidenceRank, 'evidence floor');
  if (compilerReceipt.envelope.contextBudget > context.contextBudget) throw new AuthorityError('Godskills compiler attempted to expand context');
  if (compilerReceipt.envelope.maxCompositionSize > context.maxCompositionSize) throw new AuthorityError('Godskills compiler attempted to expand composition');
  requireSubset(routeReceipt.requestFeatures?.permittedEffects ?? [], context.permittedEffects, 'effects');
  requireNoScalarExpansion(routeReceipt.requestFeatures?.maximumRisk, context.maximumRisk, riskRank, 'risk');
  requireNoScalarExpansion(routeReceipt.requestFeatures?.minimumEvidenceConfidence, context.minimumEvidenceConfidence, evidenceRank, 'evidence floor');
  if (routeReceipt.requestFeatures?.contextBudget > context.contextBudget) throw new AuthorityError('Godskills route attempted to expand context');

  if (expectedPreference !== null) {
    validatePreferenceResult({ compilerReceipt, routeReceipt, expected: expectedPreference, naturalRequest });
  } else if (compilerReceipt.envelope.preferredCapabilities !== undefined
      || routeReceipt.requestFeatures?.preferredCapabilities !== undefined
      || routeReceipt.preference !== undefined) {
    throw new Error('Godskills returned unexpected preference metadata without a verified root');
  }

  if (!statuses.has(routeReceipt.status)) throw new Error('route receipt status is unknown');
  if (!Array.isArray(routeReceipt.selectedIds) || !Array.isArray(routeReceipt.selectedEntrypoints)
      || routeReceipt.selectedIds.length !== routeReceipt.selectedEntrypoints.length) {
    throw new Error('route receipt selection arrays are inconsistent');
  }
  if (routeReceipt.selectedIds.length > context.maxCompositionSize) {
    throw new Error('route receipt exceeds the maximum composition size');
  }
  for (let index = 0; index < routeReceipt.selectedIds.length; index += 1) {
    const id = routeReceipt.selectedIds[index];
    const entrypoint = routeReceipt.selectedEntrypoints[index];
    const match = entrypoint.match(entrypointPattern);
    if (!match || match[1] !== id) {
      throw new Error('route receipt selected entrypoint does not match its id');
    }
  }

  if (routeReceipt.status === 'selected') {
    if (routeReceipt.selectedIds.length === 0 || routeReceipt.selectionKind === 'none') {
      throw new Error('route receipt selected status has no selection');
    }
  } else {
    if (routeReceipt.selectedIds.length !== 0 || routeReceipt.selectionKind !== 'none') {
      throw new Error('route receipt non-selected status contains a selection');
    }
    if (routeReceipt.status === 'needs-decision'
        && (!Array.isArray(routeReceipt.unresolvedDecisions) || routeReceipt.unresolvedDecisions.length === 0)) {
      throw new Error('route receipt needs-decision status lacks unresolved decisions');
    }
  }
  return routeReceipt;
}

export async function routeGodskill({ request, hostContext, transport, preference = null }) {
  if (!request?.requestId || !request?.text) throw new TypeError('Godskills request requires requestId and text');
  if (typeof transport !== 'function') throw new TypeError('Godskills transport must be a function');
  const expectedPreference = validatedPreference(preference);
  const context = normalizedContext(hostContext, expectedPreference);
  const naturalRequest = {
    schemaVersion: 1,
    requestId: request.requestId,
    text: request.text,
    context,
  };
  const result = await transport(naturalRequest);
  const receipt = validateRouteResult(
    result,
    request.requestId,
    context,
    expectedPreference,
    naturalRequest,
  );
  return {
    status: receipt.status,
    selectedIds: [...receipt.selectedIds],
    entrypoints: [...receipt.selectedEntrypoints],
    unresolvedDecisions: [...receipt.unresolvedDecisions],
    compilerReceipt: result.compilerReceipt,
    routeReceipt: receipt,
  };
}

function runNode(args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, { cwd, shell: false, windowsHide: true });
    child.stdout.resume();
    child.stderr.resume();
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Godskills transport exited with code ${code}`));
    });
  });
}

export async function createLocalGodskillsTransport({ repositoryRoot, preferenceProtocol: selectedProtocol = null }) {
  const root = await realpath(resolve(repositoryRoot));
  if (selectedProtocol !== null && selectedProtocol !== preferenceProtocol) {
    throw new Error('Godskills local preference transport protocol is unsupported');
  }
  const entrypoint = selectedProtocol === preferenceProtocol ? 'intent-preference.mjs' : 'intent.mjs';
  await Promise.all([
    access(join(root, 'scripts', entrypoint)),
    access(join(root, 'artifacts', 'routing', 'cards.jsonl')),
  ]);
  const temporaryRoot = resolve(tmpdir());

  return async function localGodskillsTransport(request) {
    const workspace = await mkdtemp(join(temporaryRoot, 'eternities-godskills-'));
    const safePrefix = `${temporaryRoot}${sep}`.toLowerCase();
    if (!resolve(workspace).toLowerCase().startsWith(safePrefix)) {
      throw new Error('Godskills transport temporary path escaped the system temp directory');
    }
    const requestPath = join(workspace, 'request.json');
    const outputPath = join(workspace, 'result.json');
    try {
      await writeFile(requestPath, `${canonicalJson(request)}\n`, 'utf8');
      await runNode([
        join(root, 'scripts', entrypoint),
        '--request', requestPath,
        '--output', outputPath,
      ], root);
      return JSON.parse(await readFile(outputPath, 'utf8'));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  };
}
