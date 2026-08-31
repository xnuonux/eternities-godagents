import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { createRecoverableTypedExecutionJournal } from './recoverable-typed-execution-journal.mjs';
import {
  buildRecoverableTypedCompositionIntent,
  materializeRecoverableTypedCompositionPlan,
} from '../skills/recoverable-typed-composition-contracts.mjs';
import { createRecoverableTypedCompositionCompiler } from '../skills/recoverable-typed-composition-compiler.mjs';
import { createRecoverableGodskillsAdapter } from '../skills/recoverable-godskills-adapter.mjs';
import {
  assertVerifiedLocalGodskillsProcessTransports,
  createVerifiedLocalGodskillsProcessTransports,
} from '../skills/local-recoverable-godskills-adapter.mjs';
import { createPinnedTypedExecutionStepperAdapter } from '../skills/typed-execution-stepper-adapter.mjs';

const RUNNERS = new WeakSet();

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} is required`);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function validateOptions(value) {
  requireObject(value, 'sealed local typed execution runner options');
  const allowed = new Set([
    'runtimeRoot', 'releasePin', 'routingPin', 'compositionReleasePin', 'stepperReleasePin',
    'activationClassifier', 'artifactCache', 'io', 'compositionIo', 'stepperIo', 'timeoutMs',
    'maximumGodskillsDispatchBytes', 'maximumGodskillsCompletionBytes',
    'maximumGodskillsResultBytes', 'processClock', 'processCheckpoint',
    'admissionCheckpoint', 'compilerCheckpoint', 'journalCheckpoint',
    'processLockOptions', 'admissionLockOptions', 'compilerLockOptions', 'journalLockOptions',
  ]);
  if (Object.keys(value).some((name) => !allowed.has(name))) {
    throw new TypeError('sealed local typed execution runner options are invalid');
  }
}

function compositionRoot(adapter) {
  return deepFreeze({
    sourceCommit: adapter.descriptor.typedCompositionSourceCommit,
    trustRootDigest: adapter.descriptor.parentTypedCompositionReceiptDigest,
    policyDigest: adapter.descriptor.typedCompositionPolicyDigest,
    capabilityLayerReceiptDigest: adapter.descriptor.capabilityLayerReceiptDigest,
    activationTrustRootDigest: adapter.descriptor.activationTrustRootDigest,
    registryDigest: adapter.descriptor.registryDigest,
  });
}

export function assertSealedLocalTypedExecutionRunner(value) {
  if (!value || typeof value !== 'object' || !RUNNERS.has(value)) {
    throw new TypeError('sealed local typed execution runner lacks private provenance brand');
  }
  return value;
}

export async function createSealedLocalTypedExecutionRunner(options = {}) {
  validateOptions(options);
  const {
    runtimeRoot,
    releasePin,
    routingPin,
    compositionReleasePin,
    stepperReleasePin,
    activationClassifier,
    artifactCache = new Map(),
    io,
    compositionIo = {},
    stepperIo = {},
    timeoutMs = 30_000,
    maximumGodskillsDispatchBytes = 1_048_576,
    maximumGodskillsCompletionBytes = 1_048_576,
    maximumGodskillsResultBytes = 1_048_576,
    processClock = () => new Date().toISOString(),
    processCheckpoint = async () => {},
    admissionCheckpoint = async () => {},
    compilerCheckpoint = async () => {},
    journalCheckpoint = async () => {},
    processLockOptions = {},
    admissionLockOptions = {},
    compilerLockOptions = {},
    journalLockOptions = {},
  } = options;
  if (typeof runtimeRoot !== 'string' || runtimeRoot.length === 0 || /[\0\r\n]/.test(runtimeRoot)) {
    throw new TypeError('sealed local typed execution runtime root is required');
  }
  requireFunction(activationClassifier, 'sealed local typed execution activation classifier');
  for (const [value, label] of [
    [processClock, 'process clock'], [processCheckpoint, 'process checkpoint'],
    [admissionCheckpoint, 'admission checkpoint'], [compilerCheckpoint, 'compiler checkpoint'],
    [journalCheckpoint, 'journal checkpoint'],
  ]) requireFunction(value, `sealed local typed execution ${label}`);
  for (const [value, label] of [
    [compositionIo, 'composition IO'], [stepperIo, 'stepper IO'],
    [processLockOptions, 'process lock options'], [admissionLockOptions, 'admission lock options'],
    [compilerLockOptions, 'compiler lock options'], [journalLockOptions, 'journal lock options'],
  ]) requireObject(value, `sealed local typed execution ${label}`);
  if (!(artifactCache instanceof Map)) throw new TypeError('sealed local typed execution artifact cache must be a Map');

  const root = resolve(runtimeRoot);
  const compilerRoot = join(root, 'compiler');
  const godskillsRoot = join(compilerRoot, 'godskills');
  const local = assertVerifiedLocalGodskillsProcessTransports(
    await createVerifiedLocalGodskillsProcessTransports({
      terminalRoot: join(root, 'local-process-terminal'),
      releasePin,
      routingPin,
      artifactCache,
      io,
      timeoutMs,
      maximumDispatchBytes: maximumGodskillsDispatchBytes,
      maximumCompletionBytes: maximumGodskillsCompletionBytes,
      maximumResultBytes: maximumGodskillsResultBytes,
      clock: processClock,
      checkpoint: processCheckpoint,
      lockOptions: processLockOptions,
    }),
  );
  const godskillsOptions = {
    releasePin,
    routingTransport: local.routingTransport,
    activationClassifier,
    activationTransport: local.activationTransport,
    artifactCache,
    io,
    checkpoint: admissionCheckpoint,
    lockOptions: admissionLockOptions,
  };
  const stepper = await createPinnedTypedExecutionStepperAdapter({
    compositionReleasePin,
    stepperReleasePin,
    compositionIo,
    stepperIo,
  });
  const compiler = await createRecoverableTypedCompositionCompiler({
    root: compilerRoot,
    compositionReleasePin,
    godskills: godskillsOptions,
    compositionIo,
    checkpoint: compilerCheckpoint,
    lockOptions: compilerLockOptions,
  });
  const godskills = await createRecoverableGodskillsAdapter({
    admissionRoot: godskillsRoot,
    ...godskillsOptions,
  });
  const journal = await createRecoverableTypedExecutionJournal({
    root: join(root, 'typed-executions'),
    adapter: stepper,
    checkpoint: journalCheckpoint,
    lockOptions: journalLockOptions,
  });
  const composition = compositionRoot(stepper);

  const runner = Object.freeze({
    descriptor: deepFreeze({
      protocolId: 'eternities-sealed-local-typed-execution-runner-v1',
      godskillsReleaseDigest: compiler.descriptor.godskillsReleaseDigest,
      typedComposition: clone(compiler.descriptor.composition),
      stepperTrustRootDigest: stepper.descriptor.stepperTrustRootDigest,
      journalProtocolId: journal.descriptor.protocolId,
      localExecution: clone(local.localExecution),
      callerTransportInjection: false,
      callerActivationResultInjection: false,
      methodSerialized: false,
      externalExactlyOnce: false,
      authorityExpanded: false,
      defaultLaunchEnabled: false,
    }),
    async run(input) {
      exactKeys(input, ['bindingInput', 'topology', 'missionInputs', 'executors'], 'sealed local typed execution request');
      const compilation = await compiler.compileMission({
        bindingInput: clone(input.bindingInput),
        topology: clone(input.topology),
      });
      if (compilation.status === 'pending') return compilation;
      const binding = await godskills.bindMission(clone(input.bindingInput));
      if (binding.status !== 'bound' || !binding.receipt?.activation) {
        throw new Error('sealed local typed execution binding is unavailable after compilation');
      }
      const intent = buildRecoverableTypedCompositionIntent({
        bindingInput: input.bindingInput,
        topology: input.topology,
        godskillsReleaseDigest: compiler.descriptor.godskillsReleaseDigest,
        composition,
      });
      const unsignedPlan = materializeRecoverableTypedCompositionPlan({ intent, binding });
      const compiled = stepper.compile({
        unsignedPlan,
        activationResult: clone(binding.receipt.activation),
      });
      if (compiled.plan.planDigest !== compilation.planDigest
          || compiled.method.methodDigest !== compilation.methodDigest
          || binding.receipt.activation.resultDigest !== compilation.activationResultDigest) {
        throw new Error('sealed local typed execution reconstruction differs from the durable compilation');
      }
      const execution = await journal.run({
        method: compiled.method,
        missionInputs: input.missionInputs,
        executors: input.executors,
      });
      return deepFreeze({
        status: 'completed',
        missionId: compilation.missionId,
        compilation: {
          intentDigest: compilation.intentDigest,
          compilationDigest: compilation.compilationDigest,
          activationResultDigest: compilation.activationResultDigest,
          planDigest: compilation.planDigest,
          methodDigest: compilation.methodDigest,
        },
        execution,
        authorityExpanded: false,
      });
    },
  });
  RUNNERS.add(runner);
  return runner;
}
