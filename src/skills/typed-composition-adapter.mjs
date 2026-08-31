import {
  instantiateVerifiedGodskillsTypedComposition,
  verifyGodskillsTypedCompositionRelease,
} from './typed-composition-verifier.mjs';

const ADAPTERS = new WeakSet();

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

export function assertPinnedTypedCompositionAdapter(value) {
  if (!value || typeof value !== 'object' || !ADAPTERS.has(value)) {
    throw new TypeError('pinned typed composition adapter lacks verified provenance brand');
  }
  return value;
}

export async function createPinnedTypedCompositionAdapter({ releasePin, io = {} } = {}) {
  const verification = await verifyGodskillsTypedCompositionRelease({ releasePin, io });
  const { module, registry } = await instantiateVerifiedGodskillsTypedComposition({ verification });
  const descriptor = deepFreeze({
    protocolId: verification.protocolId,
    sourceCommit: verification.sourceCommit,
    trustRootDigest: verification.trustRootDigest,
    capabilityLayerReceiptDigest: verification.capabilityLayerReceiptDigest,
    activationTrustRootDigest: verification.activationTrustRootDigest,
    registryDigest: verification.registryDigest,
    canary: {
      planDigest: verification.planDigest,
      methodDigest: verification.methodDigest,
      executionDigest: verification.executionDigest,
    },
    methodBodiesEmbedded: 0,
    sourceBodiesTransported: 0,
    authorityExpanded: false,
    defaultLaunchEnabled: false,
  });
  const adapter = Object.freeze({
    descriptor,
    compile(input) {
      exactKeys(input, ['unsignedPlan', 'activationResult'], 'typed composition compile request');
      const plan = module.sealTypedCompositionPlan(input.unsignedPlan);
      const method = module.compileTypedMissionMethod({
        registry,
        plan,
        activationResult: input.activationResult,
      });
      return Object.freeze({ plan, method });
    },
    async execute(input) {
      exactKeys(input, ['method', 'missionInputs', 'executors'], 'typed composition execution request');
      return module.executeTypedMissionMethod({
        registry,
        method: input.method,
        missionInputs: input.missionInputs,
        executors: input.executors,
      });
    },
  });
  ADAPTERS.add(adapter);
  return adapter;
}
