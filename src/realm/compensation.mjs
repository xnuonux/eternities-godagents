import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { AuthorityError, IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { assertHandPayload } from './hand-contract.mjs';

export const REALM_COMPENSATION_RELATION_PROTOCOL_ID = 'eternities-realm-compensation-relation-v1';

const RELATION_KEYS = [
  'schemaVersion',
  'protocolId',
  'contractDigest',
  'primaryHandId',
  'compensatingHandId',
  'payloadBindings',
  'outputBindings',
  'relationDigest',
];
const BINDING_KEYS = ['primaryField', 'compensatingField'];
const DIGEST = /^[a-f0-9]{64}$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} fields do not match the certified shape`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty safe string`);
  }
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new IntegrityError(`${label} is invalid`);
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(`${label} is not cloneable`, { cause: error });
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function handFor(contract, id, label) {
  const hand = contract.hands.find((entry) => entry.id === id);
  if (!hand) throw new AuthorityError(`${label} ${id} is not declared by the Realm Contract`);
  return hand;
}

function supportedHand(hand, label) {
  if (hand.idempotent !== true) throw new AuthorityError(`${label} must be idempotent`);
  if (hand.expectedOutcome?.type !== 'observation-delta') {
    throw new AuthorityError(`${label} expected outcome is not compensable`);
  }
  return hand;
}

function operationFor(rule, label) {
  const operation = rule.operation ?? 'add';
  if (operation !== 'add' && operation !== 'subtract') {
    throw new AuthorityError(`${label} operation is unsupported`);
  }
  return operation;
}

function bindingMap(bindings, label) {
  if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 32) {
    throw new TypeError(`${label} must contain between one and 32 bindings`);
  }
  const primary = new Set();
  const compensating = new Set();
  for (const binding of bindings) {
    exactKeys(binding, BINDING_KEYS, `${label} binding`);
    nonEmptyString(binding.primaryField, `${label} primaryField`);
    nonEmptyString(binding.compensatingField, `${label} compensatingField`);
    if (primary.has(binding.primaryField) || compensating.has(binding.compensatingField)) {
      throw new IntegrityError(`${label} fields must be bound one-to-one`);
    }
    primary.add(binding.primaryField);
    compensating.add(binding.compensatingField);
  }
  return { primary, compensating };
}

function validatePayloadBinding(binding, primaryHand, compensatingHand) {
  const primaryRule = primaryHand.inputSchema.properties[binding.primaryField];
  const compensatingRule = compensatingHand.inputSchema.properties[binding.compensatingField];
  if (!primaryRule || !compensatingRule
      || !primaryHand.inputSchema.required.includes(binding.primaryField)
      || !compensatingHand.inputSchema.required.includes(binding.compensatingField)) {
    throw new AuthorityError('compensation payload binding must cover required declared fields');
  }
  if (canonicalJson(primaryRule) !== canonicalJson(compensatingRule)) {
    throw new AuthorityError('compensation payload binding changes the declared value domain');
  }
}

function validateOutputBinding(binding, primaryHand, compensatingHand) {
  const primaryRule = primaryHand.expectedOutcome.fields[binding.primaryField];
  const compensatingRule = compensatingHand.expectedOutcome.fields[binding.compensatingField];
  if (!primaryRule || !compensatingRule) {
    throw new AuthorityError('compensation output binding must cover declared outcome fields');
  }
  if (primaryRule.observationField !== compensatingRule.observationField) {
    throw new AuthorityError('compensation output binding does not share the declared observation and payload fields');
  }
  const primaryOperation = operationFor(primaryRule, 'primary compensation output');
  const compensatingOperation = operationFor(compensatingRule, 'compensating output');
  if (primaryOperation === compensatingOperation) {
    throw new AuthorityError('compensation output operations are not inverse');
  }
}

function unsignedRelation({ contract, primaryHandId, compensatingHandId, payloadBindings, outputBindings }) {
  object(contract, 'compensation contract');
  assertNoCredentialFields(contract);
  assertSchema('realm-contract', contract);
  digest(sha256Value(contract), 'compensation contract digest');
  nonEmptyString(primaryHandId, 'primary compensation hand id');
  nonEmptyString(compensatingHandId, 'compensating hand id');
  if (primaryHandId === compensatingHandId) {
    throw new AuthorityError('primary and compensating Realm hands must be distinct');
  }

  const primaryHand = supportedHand(handFor(contract, primaryHandId, 'primary hand'), 'primary hand');
  const compensatingHand = supportedHand(
    handFor(contract, compensatingHandId, 'compensating hand'),
    'compensating hand',
  );
  const normalizedPayloadBindings = clone(payloadBindings, 'compensation payload bindings');
  const normalizedOutputBindings = clone(outputBindings, 'compensation output bindings');
  const payloadMap = bindingMap(normalizedPayloadBindings, 'compensation payload bindings');
  const outputMap = bindingMap(normalizedOutputBindings, 'compensation output bindings');

  const primaryRequired = new Set(primaryHand.inputSchema.required);
  const compensatingRequired = new Set(compensatingHand.inputSchema.required);
  if (payloadMap.primary.size !== primaryRequired.size
      || payloadMap.compensating.size !== compensatingRequired.size
      || [...primaryRequired].some((field) => !payloadMap.primary.has(field))
      || [...compensatingRequired].some((field) => !payloadMap.compensating.has(field))) {
    throw new AuthorityError('compensation payload bindings must cover every required field exactly once');
  }
  for (const binding of normalizedPayloadBindings) validatePayloadBinding(binding, primaryHand, compensatingHand);

  const primaryOutputs = new Set(Object.keys(primaryHand.expectedOutcome.fields));
  const compensatingOutputs = new Set(Object.keys(compensatingHand.expectedOutcome.fields));
  if (outputMap.primary.size !== primaryOutputs.size
      || outputMap.compensating.size !== compensatingOutputs.size
      || [...primaryOutputs].some((field) => !outputMap.primary.has(field))
      || [...compensatingOutputs].some((field) => !outputMap.compensating.has(field))) {
    throw new AuthorityError('compensation output bindings must cover every outcome field exactly once');
  }
  for (const binding of normalizedOutputBindings) validateOutputBinding(binding, primaryHand, compensatingHand);

  return {
    schemaVersion: 1,
    protocolId: REALM_COMPENSATION_RELATION_PROTOCOL_ID,
    contractDigest: sha256Value(contract),
    primaryHandId,
    compensatingHandId,
    payloadBindings: normalizedPayloadBindings,
    outputBindings: normalizedOutputBindings,
  };
}

export function buildRealmCompensationRelation(input) {
  object(input, 'Realm compensation relation input');
  exactKeys(input, [
    'contract', 'primaryHandId', 'compensatingHandId', 'payloadBindings', 'outputBindings',
  ], 'Realm compensation relation input');
  const unsigned = unsignedRelation(input);
  const relation = { ...unsigned, relationDigest: sha256Value(unsigned) };
  assertSchema('realm-compensation-relation', relation);
  assertNoCredentialFields(relation);
  return deepFreeze(relation);
}

export function verifyRealmCompensationRelation(value, { contract } = {}) {
  exactKeys(value, RELATION_KEYS, 'Realm compensation relation');
  assertNoCredentialFields(value);
  assertSchema('realm-compensation-relation', value);
  digest(value.contractDigest, 'Realm compensation relation contractDigest');
  digest(value.relationDigest, 'Realm compensation relation relationDigest');
  const expected = buildRealmCompensationRelation({
    contract,
    primaryHandId: value.primaryHandId,
    compensatingHandId: value.compensatingHandId,
    payloadBindings: value.payloadBindings,
    outputBindings: value.outputBindings,
  });
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new IntegrityError('Realm compensation relation does not match its contract or digest');
  }
  return deepFreeze(clone(value, 'Realm compensation relation'));
}

export function verifyRealmCompensationBinding({ relation, contract, primaryAction, compensationProposal }) {
  const verifiedRelation = verifyRealmCompensationRelation(relation, { contract });
  exactKeys(primaryAction, ['actionId', 'idempotencyKey', 'handId', 'payload'], 'primary compensation action');
  assertNoCredentialFields(primaryAction);
  exactKeys(compensationProposal, [
    'schemaVersion', 'proposalId', 'organId', 'organVersion', 'sourceStateEpoch', 'claim',
    'evidenceRefs', 'intent', 'expectedOutcome', 'cost', 'risk', 'uncertainty',
    'requiredAuthority', 'preconditions', 'expiresAt', 'priority',
  ], 'compensation proposal');
  assertNoCredentialFields(compensationProposal);
  assertSchema('organ-proposal', compensationProposal);

  if (primaryAction.handId !== verifiedRelation.primaryHandId) {
    throw new IntegrityError('primary action hand does not match the compensation relation');
  }
  if (compensationProposal.intent.handId !== verifiedRelation.compensatingHandId) {
    throw new AuthorityError('compensation proposal hand does not match the compensation relation');
  }
  const primaryHand = supportedHand(handFor(contract, primaryAction.handId, 'primary hand'), 'primary hand');
  const compensatingHand = supportedHand(
    handFor(contract, compensationProposal.intent.handId, 'compensating hand'),
    'compensating hand',
  );
  assertHandPayload(primaryHand, primaryAction.payload);
  const compensationPayload = Object.fromEntries(
    Object.entries(compensationProposal.intent).filter(([key]) => key !== 'effect' && key !== 'handId'),
  );
  assertHandPayload(compensatingHand, compensationPayload);
  for (const binding of verifiedRelation.payloadBindings) {
    if (canonicalJson(primaryAction.payload[binding.primaryField])
        !== canonicalJson(compensationPayload[binding.compensatingField])) {
      throw new AuthorityError('compensation payload changes a bound primary value');
    }
  }
  for (const binding of verifiedRelation.outputBindings) {
    const primaryRule = primaryHand.expectedOutcome.fields[binding.primaryField];
    const compensatingRule = compensatingHand.expectedOutcome.fields[binding.compensatingField];
    if (primaryRule.observationField !== compensatingRule.observationField
        || operationFor(primaryRule, 'primary compensation output') === operationFor(compensatingRule, 'compensating output')) {
      throw new IntegrityError('compensation output relation is not inverse');
    }
  }
  return verifiedRelation;
}
