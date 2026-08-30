import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { AuthorityError } from '../core/errors.mjs';

const statuses = new Set(['selected', 'needs-decision', 'no-qualified-route']);
const entrypointPattern = /^skills\/([a-z0-9-]+)\/SKILL\.md$/;
const riskRank = new Map(['low', 'moderate', 'high', 'critical'].map((value, index) => [value, index]));
const evidenceRank = new Map(['verified', 'high', 'medium', 'low'].map((value, index) => [value, index]));

const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

function normalizedContext(hostContext) {
  return {
    permittedEffects: uniqueSorted(hostContext.permittedEffects),
    availableAuthority: uniqueSorted(hostContext.availableAuthority),
    availablePreconditions: uniqueSorted(hostContext.availablePreconditions),
    forbiddenCapabilities: uniqueSorted(hostContext.forbiddenCapabilities),
    maximumRisk: hostContext.maximumRisk,
    minimumEvidenceConfidence: hostContext.minimumEvidenceConfidence,
    contextBudget: hostContext.contextBudget,
    maxCompositionSize: hostContext.maxCompositionSize,
  };
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

function validateRouteResult(result, requestId, context) {
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

export async function routeGodskill({ request, hostContext, transport }) {
  if (!request?.requestId || !request?.text) throw new TypeError('Godskills request requires requestId and text');
  if (typeof transport !== 'function') throw new TypeError('Godskills transport must be a function');
  const context = normalizedContext(hostContext);
  const naturalRequest = {
    schemaVersion: 1,
    requestId: request.requestId,
    text: request.text,
    context,
  };
  const result = await transport(naturalRequest);
  const receipt = validateRouteResult(result, request.requestId, context);
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

export async function createLocalGodskillsTransport({ repositoryRoot }) {
  const root = await realpath(resolve(repositoryRoot));
  await Promise.all([
    access(join(root, 'scripts', 'intent.mjs')),
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
        join(root, 'scripts', 'intent.mjs'),
        '--request', requestPath,
        '--output', outputPath,
      ], root);
      return JSON.parse(await readFile(outputPath, 'utf8'));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  };
}
