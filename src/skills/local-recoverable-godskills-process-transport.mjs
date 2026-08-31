import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import {
  buildRecoverableGodskillsCompletion,
  buildRecoverableGodskillsTransportDescriptor,
  verifyRecoverableGodskillsCompletion,
  verifyRecoverableGodskillsDispatch,
} from './recoverable-godskills-contracts.mjs';
import { assertVerifiedGodskillsRoutingExecutable } from './routing-executable-verifier.mjs';

const MAX_BYTES = 16_777_216;
const EXECUTION_PROTOCOL = 'eternities-local-godskills-process-execution-v1';
const SUCCESS_PROTOCOL = 'eternities-local-godskills-process-success-v1';

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}

function requireContained(root, target, label) {
  const remainder = relative(root, target);
  if (remainder !== '' && !remainder.startsWith('..') && !isAbsolute(remainder)) return;
  throw new Error(`${label} escaped the local Godskills terminal root`);
}

function pathIdentity(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} fields are invalid`);
}

function iso(value, label) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40
      || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be an ISO timestamp`);
  }
  return value;
}

function minimalChildEnvironment() {
  const environment = {};
  if (typeof process.env.SystemRoot === 'string') environment.SystemRoot = process.env.SystemRoot;
  if (typeof process.env.WINDIR === 'string') environment.WINDIR = process.env.WINDIR;
  return environment;
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
    child.once('error', (error) => finish(new Error(`local Godskills process failed: ${error.message}`, { cause: error })));
    child.once('close', (code) => {
      if (timedOut) finish(new Error(`local Godskills process timed out after ${timeoutMs}ms`));
      else if (code !== 0) finish(new Error(`local Godskills process exited with code ${code}`));
      else finish();
    });
  });
}

async function readCanonical(path, label, verify = (value) => value) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
  if (text !== `${canonicalJson(value)}\n`) throw new Error(`${label} bytes are not canonical`);
  return verify(value);
}

async function publishExact(path, value, label, verify = (candidate) => candidate) {
  const published = await publishFileExclusive({
    destinationPath: path,
    content: `${canonicalJson(value)}\n`,
  });
  if (published) return value;
  const existing = await readCanonical(path, label, verify);
  if (!existing || canonicalJson(existing) !== canonicalJson(value)) {
    throw new Error(`${label} changed during publication`);
  }
  return existing;
}

function buildExecution({ stage, dispatchDigest, configurationDigest, startedAt }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: EXECUTION_PROTOCOL,
    stage,
    dispatchDigest,
    configurationDigest,
    startedAt,
  };
  return Object.freeze({ ...unsigned, executionDigest: sha256Value(unsigned) });
}

function verifyExecution(value, { stage, dispatchDigest, configurationDigest }) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'stage', 'dispatchDigest',
    'configurationDigest', 'startedAt', 'executionDigest',
  ], 'local Godskills execution record');
  const { executionDigest, ...unsigned } = value;
  if (value.schemaVersion !== 1 || value.protocolId !== EXECUTION_PROTOCOL
      || value.stage !== stage || value.dispatchDigest !== dispatchDigest
      || value.configurationDigest !== configurationDigest
      || executionDigest !== sha256Value(unsigned)) {
    throw new Error('local Godskills execution record binding is invalid');
  }
  iso(value.startedAt, 'local Godskills execution start');
  return value;
}

function buildSuccess({ stage, dispatchDigest, configurationDigest, execution, result, completedAt }) {
  const resultBytes = Buffer.byteLength(`${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const unsigned = {
    schemaVersion: 1,
    protocolId: SUCCESS_PROTOCOL,
    status: 'succeeded',
    stage,
    dispatchDigest,
    configurationDigest,
    executionDigest: execution.executionDigest,
    resultDigest: sha256Value(result),
    resultBytes,
    completedAt,
  };
  return Object.freeze({ ...unsigned, successDigest: sha256Value(unsigned) });
}

function verifySuccess(value, { stage, dispatchDigest, configurationDigest, execution, result }) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'stage', 'dispatchDigest',
    'configurationDigest', 'executionDigest', 'resultDigest', 'resultBytes',
    'completedAt', 'successDigest',
  ], 'local Godskills process success record');
  const { successDigest, ...unsigned } = value;
  const resultBytes = Buffer.byteLength(`${JSON.stringify(result, null, 2)}\n`, 'utf8');
  if (value.schemaVersion !== 1 || value.protocolId !== SUCCESS_PROTOCOL
      || value.status !== 'succeeded' || value.stage !== stage
      || value.dispatchDigest !== dispatchDigest
      || value.configurationDigest !== configurationDigest
      || value.executionDigest !== execution.executionDigest
      || value.resultDigest !== sha256Value(result) || value.resultBytes !== resultBytes
      || successDigest !== sha256Value(unsigned)) {
    throw new Error('local Godskills process success record binding is invalid');
  }
  iso(value.completedAt, 'local Godskills process completion');
  if (Date.parse(value.completedAt) < Date.parse(execution.startedAt)) {
    throw new Error('local Godskills process success precedes execution');
  }
  return value;
}

function processArguments({ stage, mode, requestPath, outputPath, receiptPath }) {
  return stage === 'route'
    ? ['--mode', mode, '--request', requestPath, '--output', outputPath, '--receipt', receiptPath]
    : ['--request', requestPath, '--output', outputPath, '--receipt', receiptPath];
}

function liveContention(error) {
  return error instanceof IntegrityError
    && ['resource is locked by a live or recent owner', 'resource lock contention could not be resolved'].includes(error.message);
}

async function boundedResult(path, maximumResultBytes) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('local Godskills result must be a regular file');
  }
  if (metadata.size > maximumResultBytes) {
    throw new Error(`local Godskills result exceeds the ${maximumResultBytes} byte ceiling`);
  }
  const bytes = await readFile(path);
  if (bytes.length > maximumResultBytes) {
    throw new Error(`local Godskills result exceeds the ${maximumResultBytes} byte ceiling`);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error('local Godskills result is invalid JSON', { cause: error });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('local Godskills result must be an object');
  }
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  if (!bytes.equals(Buffer.from(expected, 'utf8'))) {
    throw new Error('local Godskills result bytes are not canonical executable output');
  }
  return value;
}

export async function createLocalRecoverableGodskillsProcessTransport({
  verification: inputVerification,
  stage,
  terminalRoot,
  timeoutMs = 30_000,
  maximumDispatchBytes = 1_048_576,
  maximumCompletionBytes = 1_048_576,
  maximumResultBytes = 1_048_576,
  clock = () => new Date().toISOString(),
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  const verification = assertVerifiedGodskillsRoutingExecutable(inputVerification);
  if (!['route', 'activation'].includes(stage)) throw new TypeError('local Godskills process stage is invalid');
  if (typeof terminalRoot !== 'string' || terminalRoot.length === 0 || /[\0\r\n]/.test(terminalRoot)) {
    throw new TypeError('local Godskills terminal root is required');
  }
  requireInteger(timeoutMs, 'local Godskills timeout', 1, 120_000);
  requireInteger(maximumDispatchBytes, 'local Godskills dispatch byte ceiling', 256, MAX_BYTES);
  requireInteger(maximumCompletionBytes, 'local Godskills completion byte ceiling', 256, MAX_BYTES);
  requireInteger(maximumResultBytes, 'local Godskills result byte ceiling', 1, MAX_BYTES);
  if (typeof clock !== 'function' || typeof checkpoint !== 'function') {
    throw new TypeError('local Godskills clock and checkpoint must be functions');
  }

  const mode = verification.release.preference ? 'specialist' : 'default';
  const target = stage === 'route' ? verification.routing : verification.release.activation;
  if (!target) throw new Error(`verified Godskills ${stage} executable is unavailable`);
  const entrypoint = resolve(target.entrypoint.absolutePath);
  const repositoryRoot = resolve(target.root);
  const receiptPath = resolve(repositoryRoot, target.executableReceipt.path);
  requireContained(repositoryRoot, entrypoint, 'local Godskills entrypoint');
  requireContained(repositoryRoot, receiptPath, 'local Godskills executable receipt');
  const configurationDigest = sha256Value({
    stage,
    mode: stage === 'route' ? mode : null,
    trustRootDigest: target.trustRootDigest,
    timeoutMs,
    maximumResultBytes,
  });
  const descriptor = buildRecoverableGodskillsTransportDescriptor({
    stage,
    transportId: `sealed-local-${stage}-${stage === 'route' ? mode : 'fixed'}-${configurationDigest}`,
    maximumDispatchBytes,
    maximumCompletionBytes,
  });

  const requestedRoot = resolve(terminalRoot);
  await mkdir(requestedRoot, { recursive: true });
  const root = await realpath(requestedRoot);
  if (pathIdentity(root) !== pathIdentity(requestedRoot)) {
    throw new Error('local Godskills terminal root is a symlink or non-canonical alias');
  }

  function pathsFor(dispatch) {
    const operationRoot = resolve(root, stage, dispatch.dispatchDigest);
    requireContained(root, operationRoot, 'local Godskills operation');
    return {
      operationRoot,
      dispatchPath: join(operationRoot, 'dispatch.json'),
      requestPath: join(operationRoot, 'request.json'),
      executionPath: join(operationRoot, 'execution.json'),
      outputPath: join(operationRoot, 'result.json'),
      successPath: join(operationRoot, 'success.json'),
      completionPath: join(operationRoot, 'completion.json'),
      lockPath: join(operationRoot, 'execution.lock'),
    };
  }

  async function verifyOperationRecords(paths, dispatch) {
    const storedDispatch = await readCanonical(
      paths.dispatchPath,
      'local Godskills dispatch',
      (value) => verifyRecoverableGodskillsDispatch(value, { transportDescriptor: descriptor }),
    );
    if (!storedDispatch || canonicalJson(storedDispatch) !== canonicalJson(dispatch)) {
      throw new Error('local Godskills operation dispatch record is missing or changed');
    }
    const storedRequest = await readCanonical(paths.requestPath, 'local Godskills request');
    if (!storedRequest || canonicalJson(storedRequest) !== canonicalJson(dispatch.request)) {
      throw new Error('local Godskills operation request record is missing or changed');
    }
  }

  async function executionAt(paths, dispatch) {
    const execution = await readCanonical(
      paths.executionPath,
      'local Godskills execution record',
      (value) => verifyExecution(value, {
        stage,
        dispatchDigest: dispatch.dispatchDigest,
        configurationDigest,
      }),
    );
    if (!execution) throw new Error('local Godskills operation execution record is missing');
    return execution;
  }

  async function successAt(paths, dispatch, execution, result) {
    const success = await readCanonical(
      paths.successPath,
      'local Godskills process success record',
      (value) => verifySuccess(value, {
        stage,
        dispatchDigest: dispatch.dispatchDigest,
        configurationDigest,
        execution,
        result,
      }),
    );
    if (!success) throw new Error('local Godskills process success record is missing');
    return success;
  }

  async function completionAt(paths, dispatch) {
    const completion = await readCanonical(
      paths.completionPath,
      'local Godskills completion',
      (value) => verifyRecoverableGodskillsCompletion(value, {
        dispatch,
        transportDescriptor: descriptor,
      }),
    );
    if (!completion) return null;
    await verifyOperationRecords(paths, dispatch);
    const execution = await executionAt(paths, dispatch);
    const result = await boundedResult(paths.outputPath, maximumResultBytes);
    if (!result || canonicalJson(result) !== canonicalJson(completion.result)) {
      throw new Error('local Godskills operation result is missing or changed');
    }
    await successAt(paths, dispatch, execution, result);
    return completion;
  }

  async function materialize(paths, dispatch) {
    const result = await boundedResult(paths.outputPath, maximumResultBytes);
    if (result === null) return null;
    await verifyOperationRecords(paths, dispatch);
    const execution = await executionAt(paths, dispatch);
    const success = await successAt(paths, dispatch, execution, result);
    const completion = buildRecoverableGodskillsCompletion({
      dispatch,
      transportDescriptor: descriptor,
      result,
      startedAt: execution.startedAt,
      completedAt: success.completedAt,
    });
    return publishExact(
      paths.completionPath,
      completion,
      'local Godskills completion',
      (value) => verifyRecoverableGodskillsCompletion(value, {
        dispatch,
        transportDescriptor: descriptor,
      }),
    );
  }

  async function acquire(paths) {
    try {
      return await acquireFileLock({ ...lockOptions, lockPath: paths.lockPath });
    } catch (error) {
      if (liveContention(error)) return null;
      throw error;
    }
  }

  async function reconcile(inputDispatch) {
    const dispatch = verifyRecoverableGodskillsDispatch(structuredClone(inputDispatch), {
      transportDescriptor: descriptor,
    });
    const paths = pathsFor(dispatch);
    const existing = await completionAt(paths, dispatch);
    if (existing) return { status: 'completed', completion: structuredClone(existing) };
    const lock = await acquire(paths);
    if (!lock) return { status: 'pending' };
    try {
      const rechecked = await completionAt(paths, dispatch);
      if (rechecked) return { status: 'completed', completion: structuredClone(rechecked) };
      const completion = await materialize(paths, dispatch);
      return completion
        ? { status: 'completed', completion: structuredClone(completion) }
        : { status: 'absent' };
    } finally {
      await lock.release();
    }
  }

  async function execute(inputDispatch) {
    const dispatch = verifyRecoverableGodskillsDispatch(structuredClone(inputDispatch), {
      transportDescriptor: descriptor,
    });
    const paths = pathsFor(dispatch);
    const lock = await acquire(paths);
    if (!lock) return { status: 'pending' };
    try {
      await mkdir(paths.operationRoot, { recursive: true });
      const existing = await completionAt(paths, dispatch);
      if (existing) return { status: 'completed', completion: structuredClone(existing) };
      const recovered = await materialize(paths, dispatch);
      if (recovered) return { status: 'completed', completion: structuredClone(recovered) };

      await publishExact(
        paths.dispatchPath,
        dispatch,
        'local Godskills dispatch',
        (value) => verifyRecoverableGodskillsDispatch(value, { transportDescriptor: descriptor }),
      );
      await publishExact(paths.requestPath, dispatch.request, 'local Godskills request');
      let execution = await readCanonical(
        paths.executionPath,
        'local Godskills execution record',
        (value) => verifyExecution(value, {
          stage,
          dispatchDigest: dispatch.dispatchDigest,
          configurationDigest,
        }),
      );
      if (!execution) {
        execution = buildExecution({
          stage,
          dispatchDigest: dispatch.dispatchDigest,
          configurationDigest,
          startedAt: iso(clock(), 'local Godskills execution start'),
        });
        await publishExact(paths.executionPath, execution, 'local Godskills execution record');
      }

      await Promise.all([access(entrypoint), access(receiptPath)]);
      const context = Object.freeze({
        stage,
        mode: stage === 'route' ? mode : null,
        operationRoot: paths.operationRoot,
        dispatchDigest: dispatch.dispatchDigest,
      });
      await checkpoint(`before-local-godskills-${stage}-process`, context);
      await runNode(environmentScrubbingArguments(entrypoint, processArguments({
        stage,
        mode,
        requestPath: paths.requestPath,
        outputPath: paths.outputPath,
        receiptPath,
      })), repositoryRoot, timeoutMs);
      const processResult = await boundedResult(paths.outputPath, maximumResultBytes);
      if (!processResult) throw new Error('local Godskills process produced no result');
      const success = buildSuccess({
        stage,
        dispatchDigest: dispatch.dispatchDigest,
        configurationDigest,
        execution,
        result: processResult,
        completedAt: iso(clock(), 'local Godskills process completion'),
      });
      await publishExact(
        paths.successPath,
        success,
        'local Godskills process success record',
        (value) => verifySuccess(value, {
          stage,
          dispatchDigest: dispatch.dispatchDigest,
          configurationDigest,
          execution,
          result: processResult,
        }),
      );
      await checkpoint(`after-local-godskills-${stage}-process`, context);
      const completion = await materialize(paths, dispatch);
      if (!completion) throw new Error('local Godskills process produced no result');
      return { status: 'completed', completion: structuredClone(completion) };
    } finally {
      await lock.release();
    }
  }

  return Object.freeze({
    stage,
    mode: stage === 'route' ? mode : null,
    descriptor: () => structuredClone(descriptor),
    reconcile,
    execute,
  });
}
