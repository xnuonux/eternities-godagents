import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { verifyIdentityBoundMissionVesselRequest } from '../runtime/identity-bound-mission-vessel-contracts.mjs';
import { verifyRecoverableTypedCompositionTopology } from '../skills/recoverable-typed-composition-contracts.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function clone(value) {
  return structuredClone(value);
}

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
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

export function verifyTypedCapabilityExecutorDescriptor(input) {
  const value = clone(input);
  assertNoCredentialFields(value);
  assertSchema('typed-capability-executor-descriptor', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'executorId', 'capabilityId', 'authority',
    'maximumInputBytes', 'maximumOutputBytes',
  ], 'typed capability executor descriptor');
  if (!IDENTIFIER.test(value.executorId) || !IDENTIFIER.test(value.capabilityId)) {
    throw new TypeError('typed capability executor descriptor identity is invalid');
  }
  if (value.authority.length !== 0) {
    throw new TypeError('typed capability executor descriptor authority must be empty');
  }
  return deepFreeze(value);
}

export function verifyAdmittedTypedExecutionHostRequest(input) {
  const value = clone(input);
  assertNoCredentialFields(value);
  exactKeys(value, ['missionRequest', 'topology', 'missionInputs'], 'admitted typed execution host request');
  value.missionRequest = clone(verifyIdentityBoundMissionVesselRequest(value.missionRequest));
  value.topology = clone(verifyRecoverableTypedCompositionTopology(value.topology));
  if (value.topology.missionId !== value.missionRequest.mission.missionId) {
    throw new TypeError('admitted typed execution topology mission identity differs from request');
  }
  if (!value.missionInputs || typeof value.missionInputs !== 'object' || Array.isArray(value.missionInputs)) {
    throw new TypeError('admitted typed execution mission inputs must be an object');
  }
  const declared = value.topology.missionInputs.map(({ artifactId }) => artifactId).sort();
  if (canonicalJson(Object.keys(value.missionInputs).sort()) !== canonicalJson(declared)) {
    throw new TypeError('admitted typed execution mission input set differs from topology');
  }
  return deepFreeze(value);
}

export function buildAdmittedTypedExecutionHostCompletion({
  missionId,
  policyDigest,
  admissionBindingDigest,
  candidateDigest,
  compilationDigest,
  executionDigest,
} = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-admitted-sealed-typed-execution-host-completion-v1',
    status: 'completed',
    missionId,
    policyDigest,
    admissionBindingDigest,
    candidateDigest,
    compilationDigest,
    executionDigest,
    authorityExpanded: false,
  };
  return verifyAdmittedTypedExecutionHostCompletion({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  });
}

export function verifyAdmittedTypedExecutionHostCompletion(input) {
  const value = clone(input);
  assertNoCredentialFields(value);
  assertSchema('admitted-typed-execution-host-completion', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'missionId', 'policyDigest',
    'admissionBindingDigest', 'candidateDigest', 'compilationDigest',
    'executionDigest', 'authorityExpanded', 'receiptDigest',
  ], 'admitted typed execution host completion');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) {
    throw new TypeError('admitted typed execution host completion digest mismatch');
  }
  return deepFreeze(value);
}
