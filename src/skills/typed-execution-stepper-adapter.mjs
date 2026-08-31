import {
  instantiateVerifiedGodskillsTypedComposition,
  verifyGodskillsTypedCompositionRelease,
} from './typed-composition-verifier.mjs';
import {
  instantiateVerifiedGodskillsTypedExecutionStepper,
  verifyGodskillsTypedExecutionStepperRelease,
} from './typed-execution-stepper-verifier.mjs';

const ADAPTERS = new WeakSet();
const EXECUTIONS = new WeakMap();

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

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assertPinnedTypedExecutionStepperAdapter(value) {
  if (!value || typeof value !== 'object' || !ADAPTERS.has(value)) {
    throw new TypeError('pinned typed execution stepper adapter lacks private provenance brand');
  }
  return value;
}

export function assertPinnedTypedExecution(value) {
  if (!value || typeof value !== 'object' || !EXECUTIONS.has(value)) {
    throw new TypeError('pinned typed execution lacks private provenance brand');
  }
  return value;
}

export async function createPinnedTypedExecutionStepperAdapter({
  compositionReleasePin,
  stepperReleasePin,
  compositionIo = {},
  stepperIo = {},
} = {}) {
  const [compositionVerification, stepperVerification] = await Promise.all([
    verifyGodskillsTypedCompositionRelease({ releasePin: compositionReleasePin, io: compositionIo }),
    verifyGodskillsTypedExecutionStepperRelease({ releasePin: stepperReleasePin, io: stepperIo }),
  ]);
  if (stepperVerification.parentTypedCompositionReceiptDigest !== compositionVerification.trustRootDigest) {
    throw new Error('typed execution stepper parent differs from the verified typed composition release');
  }
  const [{ module: compositionModule, registry }, stepperModule] = await Promise.all([
    instantiateVerifiedGodskillsTypedComposition({ verification: compositionVerification }),
    instantiateVerifiedGodskillsTypedExecutionStepper({ verification: stepperVerification }),
  ]);
  const owner = Object.freeze({});

  function state(execution) {
    assertPinnedTypedExecution(execution);
    const value = EXECUTIONS.get(execution);
    if (value.owner !== owner) throw new Error('pinned typed execution belongs to another adapter');
    return value;
  }

  const adapter = Object.freeze({
    descriptor: deepFreeze({
      protocolId: 'eternities-godagents-typed-execution-stepper-adapter-v1',
      typedCompositionSourceCommit: compositionVerification.sourceCommit,
      parentTypedCompositionReceiptDigest: compositionVerification.trustRootDigest,
      stepperSourceCommit: stepperVerification.sourceCommit,
      stepperTrustRootDigest: stepperVerification.trustRootDigest,
      typedCompositionPolicyDigest: compositionReleasePin.policy.sha256,
      capabilityLayerReceiptDigest: compositionVerification.capabilityLayerReceiptDigest,
      activationTrustRootDigest: compositionVerification.activationTrustRootDigest,
      registryDigest: compositionVerification.registryDigest,
      methodBodiesEmbedded: 0,
      sourceBodiesTransported: 0,
      authorityExpanded: false,
      defaultLaunchEnabled: false,
      externalExactlyOnce: false,
    }),
    compile(input) {
      exactKeys(input, ['unsignedPlan', 'activationResult'], 'typed execution compile request');
      const plan = compositionModule.sealTypedCompositionPlan(input.unsignedPlan);
      const method = compositionModule.compileTypedMissionMethod({
        registry,
        plan,
        activationResult: input.activationResult,
      });
      return Object.freeze({ plan, method });
    },
    begin(input) {
      exactKeys(input, ['method', 'missionInputs'], 'typed execution begin request');
      const raw = stepperModule.beginTypedMissionExecution({
        registry,
        method: input.method,
        missionInputs: input.missionInputs,
      });
      const execution = deepFreeze(structuredClone(raw));
      EXECUTIONS.set(execution, { owner, raw });
      return execution;
    },
    next(input) {
      exactKeys(input, ['execution'], 'typed execution next request');
      const value = state(input.execution);
      return stepperModule.nextTypedMissionExecutionStep({ registry, execution: value.raw });
    },
    commit(input) {
      exactKeys(input, ['execution', 'step', 'output'], 'typed execution commit request');
      const value = state(input.execution);
      return stepperModule.commitTypedMissionExecutionStep({
        registry,
        execution: value.raw,
        step: input.step,
        output: input.output,
      });
    },
  });
  ADAPTERS.add(adapter);
  return adapter;
}
