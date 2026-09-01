import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import {
  bindProviderResolutionAuthoritySignature,
  buildProviderResolutionAuthoritySigningRequest,
  verifyProviderResolutionAuthoritySignedReturn,
  verifyProviderResolutionAuthoritySigningRequest,
} from './provider-resolution-authority-handoff.mjs';
import { verifyProviderPhaseHostDescription } from './provider-phase-host-sdk.mjs';

const OPERATION_PROTOCOL = 'eternities-provider-resolution-authority-outbox-operation-v1';
const TERMINAL_PROTOCOL = 'eternities-provider-resolution-authority-outbox-terminal-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const CONFIGURATION_FIELDS = Object.freeze([
  'root', 'host', 'controller', 'checkpoint', 'lockOptions',
]);

export class ProviderResolutionAuthorityOutboxError extends Error {
  constructor(code, cause) {
    super('Provider resolution authority outbox failed', cause === undefined ? undefined : { cause });
    this.name = 'ProviderResolutionAuthorityOutboxError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new ProviderResolutionAuthorityOutboxError(code, cause);
}

function clone(value) { return structuredClone(value); }
function same(left, right) { return canonicalJson(left) === canonicalJson(right); }
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new TypeError(`${label} fields are invalid`);
  }
}
function verifyHost(value) {
  exactKeys(value, [
    'describe', 'assertCredentialAbsent', 'createOperatorResolutionController',
    'native', 'review', 'revision',
  ], 'provider phase host');
  if (typeof value.describe !== 'function') throw new TypeError('provider phase host describe is required');
  return verifyProviderPhaseHostDescription(clone(value.describe()));
}
function verifyController(value) {
  exactKeys(value, ['policyDigest', 'authorityKeyId', 'inspect', 'resolve'], 'resolution controller');
  if (!DIGEST.test(value.policyDigest) || typeof value.authorityKeyId !== 'string'
      || typeof value.inspect !== 'function' || typeof value.resolve !== 'function') {
    throw new TypeError('resolution controller is invalid');
  }
}
function operationIdentity(description, controller, phase, dispatch) {
  if (!description.capabilities.phases.includes(phase)
      || !dispatch || typeof dispatch !== 'object' || !DIGEST.test(dispatch.dispatchDigest)) {
    throw new TypeError('authority outbox operation is invalid');
  }
  const binding = {
    protocolId: OPERATION_PROTOCOL,
    family: description.family,
    hostDescriptionDigest: description.descriptionDigest,
    resolutionPolicyDigest: controller.policyDigest,
    phase,
    dispatchDigest: dispatch.dispatchDigest,
  };
  return { binding, operationId: sha256Value(binding) };
}
function paths(root, operationId) {
  const operationRoot = join(root, 'operations', operationId);
  return {
    operationRoot,
    request: join(operationRoot, 'request.json'),
    signedReturn: join(operationRoot, 'signed-return.json'),
    terminal: join(operationRoot, 'terminal.json'),
    lock: join(operationRoot, 'operation.lock'),
  };
}
async function readCanonical(path, label, verify) {
  let text;
  try { text = await readFile(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let value;
  try { value = JSON.parse(text); } catch (error) { fail('record-invalid', error); }
  if (text !== `${canonicalJson(value)}\n`) fail('record-invalid');
  try { return verify(value); } catch (error) { fail('record-invalid', error); }
}
async function publishExact(path, value, label, verify) {
  const published = await publishFileExclusive({
    destinationPath: path,
    content: `${canonicalJson(value)}\n`,
  });
  if (published) return value;
  const existing = await readCanonical(path, label, verify);
  if (!existing || !same(existing, value)) fail('record-collision');
  return existing;
}
function context(description, controller, request) {
  return {
    hostDescription: description,
    controller: {
      policyDigest: controller.policyDigest,
      authorityKeyId: controller.authorityKeyId,
    },
    inspected: {
      status: 'pending',
      operation: clone(request.operation),
      resolutionAccepted: false,
    },
  };
}
function terminalFor(result, request) {
  if (!result || !['completed', 'abandoned'].includes(result.status)
      || result.decisionDigest !== request.decision.decisionDigest
      || !DIGEST.test(result.resolutionRecordDigest)) fail('controller-result-invalid');
  const unsigned = {
    schemaVersion: 1,
    protocolId: TERMINAL_PROTOCOL,
    status: 'resolved',
    outcomeStatus: result.status,
    requestDigest: request.requestDigest,
    decisionDigest: result.decisionDigest,
    resolutionRecordDigest: result.resolutionRecordDigest,
  };
  return deepFreeze({ ...unsigned, terminalDigest: sha256Value(unsigned) });
}
function verifyTerminal(value, request) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'outcomeStatus', 'requestDigest',
    'decisionDigest', 'resolutionRecordDigest', 'terminalDigest',
  ], 'authority outbox terminal');
  const { terminalDigest, ...unsigned } = value;
  if (value.schemaVersion !== 1 || value.protocolId !== TERMINAL_PROTOCOL
      || value.status !== 'resolved' || !['completed', 'abandoned'].includes(value.outcomeStatus)
      || value.requestDigest !== request.requestDigest
      || value.decisionDigest !== request.decision.decisionDigest
      || !DIGEST.test(value.resolutionRecordDigest) || !DIGEST.test(terminalDigest)
      || terminalDigest !== sha256Value(unsigned)) fail('record-invalid');
  return deepFreeze(clone(value));
}

export async function createProviderResolutionAuthorityOutbox(options = {}) {
  exactKeys(options, CONFIGURATION_FIELDS.filter((key) => Object.hasOwn(options, key)), 'authority outbox configuration');
  const unknown = Object.keys(options).filter((key) => !CONFIGURATION_FIELDS.includes(key));
  if (unknown.length > 0 || typeof options.root !== 'string' || options.root.length < 1
      || /[\0\r\n]/.test(options.root)) throw new TypeError('authority outbox root is invalid');
  const description = verifyHost(options.host);
  verifyController(options.controller);
  const root = resolve(options.root);
  const checkpoint = options.checkpoint ?? (async () => {});
  const lockOptions = options.lockOptions ?? {};
  if (typeof checkpoint !== 'function' || !lockOptions || typeof lockOptions !== 'object'
      || Array.isArray(lockOptions)) throw new TypeError('authority outbox policy is invalid');

  async function withLock(phase, dispatch, callback) {
    const identity = operationIdentity(description, options.controller, phase, dispatch);
    const operationPaths = paths(root, identity.operationId);
    await mkdir(operationPaths.operationRoot, { recursive: true });
    const lock = await acquireFileLock({ ...lockOptions, lockPath: operationPaths.lock });
    try { return await callback(operationPaths, identity); } finally { await lock.release(); }
  }

  async function prepare(input = {}) {
    const { phase, dispatch, ...decisionInput } = input;
    return withLock(phase, dispatch, async (operationPaths) => {
      const inspected = await options.controller.inspect({ phase, dispatch: clone(dispatch) });
      const request = buildProviderResolutionAuthoritySigningRequest({
        hostDescription: description,
        controller: { policyDigest: options.controller.policyDigest, authorityKeyId: options.controller.authorityKeyId },
        inspected,
        ...clone(decisionInput),
      });
      const requestContext = context(description, options.controller, request);
      const exact = await publishExact(operationPaths.request, request, 'signing request',
        (value) => verifyProviderResolutionAuthoritySigningRequest({ request: value, ...requestContext }));
      await checkpoint('after-authority-outbox-request-published', request.requestDigest);
      return deepFreeze(clone(exact));
    });
  }

  async function inspectStored(operationPaths) {
    const raw = await readCanonical(operationPaths.request, 'signing request', (value) => value);
    if (!raw) return null;
    const requestContext = context(description, options.controller, raw);
    const request = verifyProviderResolutionAuthoritySigningRequest({ request: raw, ...requestContext });
    return { request, requestContext };
  }

  async function reconcile({ phase, dispatch } = {}) {
    return withLock(phase, dispatch, async (operationPaths) => {
      const stored = await inspectStored(operationPaths);
      if (!stored) return Object.freeze({ status: 'absent' });
      const terminal = await readCanonical(operationPaths.terminal, 'terminal',
        (value) => verifyTerminal(value, stored.request));
      if (terminal) return terminal;
      const signedReturn = await readCanonical(operationPaths.signedReturn, 'signed return',
        (value) => verifyProviderResolutionAuthoritySignedReturn({ value, request: stored.request, ...stored.requestContext }));
      const controllerState = await options.controller.inspect({ phase, dispatch: clone(dispatch) });
      if (controllerState.status === 'completed' || controllerState.status === 'abandoned') {
        if (!signedReturn) fail('record-invalid');
        const resolved = terminalFor(controllerState, stored.request);
        return publishExact(operationPaths.terminal, resolved, 'terminal',
          (value) => verifyTerminal(value, stored.request));
      }
      if (controllerState.status !== 'pending') fail('controller-state-invalid');
      verifyProviderResolutionAuthoritySigningRequest({
        request: stored.request,
        hostDescription: description,
        controller: {
          policyDigest: options.controller.policyDigest,
          authorityKeyId: options.controller.authorityKeyId,
        },
        inspected: controllerState,
      });
      return deepFreeze({
        status: signedReturn ? 'signed' : 'awaiting-signature',
        requestDigest: stored.request.requestDigest,
      });
    });
  }

  async function submit({ phase, dispatch, requestDigest, signature, response } = {}) {
    return withLock(phase, dispatch, async (operationPaths) => {
      const stored = await inspectStored(operationPaths);
      if (!stored || requestDigest !== stored.request.requestDigest) fail('request-mismatch');
      const controllerState = await options.controller.inspect({ phase, dispatch: clone(dispatch) });
      if (controllerState.status === 'completed' || controllerState.status === 'abandoned') {
        const signed = await readCanonical(operationPaths.signedReturn, 'signed return',
          (value) => verifyProviderResolutionAuthoritySignedReturn({ value, request: stored.request, ...stored.requestContext }));
        if (!signed) fail('record-invalid');
        const terminal = terminalFor(controllerState, stored.request);
        return publishExact(operationPaths.terminal, terminal, 'terminal',
          (value) => verifyTerminal(value, stored.request));
      }
      if (controllerState.status !== 'pending') fail('controller-state-invalid');
      const currentContext = { ...stored.requestContext, inspected: controllerState };
      const signedReturn = bindProviderResolutionAuthoritySignature({
        request: stored.request, signature, ...currentContext,
      });
      const exactSigned = await publishExact(operationPaths.signedReturn, signedReturn, 'signed return',
        (value) => verifyProviderResolutionAuthoritySignedReturn({ value, request: stored.request, ...stored.requestContext }));
      await checkpoint('after-authority-outbox-signed-return-published', stored.request.requestDigest);
      const result = await options.controller.resolve({
        phase,
        dispatch: clone(dispatch),
        signedDecision: clone(exactSigned.signedDecision),
        ...(response === undefined ? {} : { response: clone(response) }),
      });
      await checkpoint('after-authority-outbox-controller-accepted', stored.request.requestDigest);
      const terminal = terminalFor(result, stored.request);
      const exactTerminal = await publishExact(operationPaths.terminal, terminal, 'terminal',
        (value) => verifyTerminal(value, stored.request));
      await checkpoint('after-authority-outbox-terminal-published', stored.request.requestDigest);
      return exactTerminal;
    });
  }

  return Object.freeze({ prepare, reconcile, submit });
}
