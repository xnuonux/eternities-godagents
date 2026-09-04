import { canonicalJson } from '../core/canonical-json.mjs';
import { AuthorityError } from '../core/errors.mjs';

function matchesType(type, value) {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return false;
}

export function assertHandPayload(hand, payload) {
  const schema = hand?.inputSchema;
  if (!schema || schema.type !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AuthorityError('action payload does not satisfy the Realm hand contract');
  }
  const keys = Object.keys(payload);
  if (schema.additionalProperties === false && keys.some((key) => !Object.hasOwn(schema.properties, key))) {
    throw new AuthorityError('action payload contains an undeclared field');
  }
  for (const required of schema.required) {
    if (!Object.hasOwn(payload, required)) throw new AuthorityError('action payload lacks a required field');
  }
  for (const [key, value] of Object.entries(payload)) {
    const constraint = schema.properties[key];
    if (!constraint || !matchesType(constraint.type, value)) {
      throw new AuthorityError('action payload field has the wrong type');
    }
    if (constraint.minimum !== undefined && value < constraint.minimum) {
      throw new AuthorityError('action payload field is below its Realm minimum');
    }
    if (constraint.maximum !== undefined && value > constraint.maximum) {
      throw new AuthorityError('action payload field exceeds its Realm maximum');
    }
  }
  return payload;
}

export function deriveExpectedOutcome(hand, payload, observation) {
  assertHandPayload(hand, payload);
  if (hand.expectedOutcome?.type !== 'observation-delta') {
    throw new AuthorityError('Realm hand expected-outcome contract is unsupported');
  }
  return Object.fromEntries(Object.entries(hand.expectedOutcome.fields).map(([outputField, rule]) => {
    const base = observation?.[rule.observationField];
    const delta = payload?.[rule.addInputField];
    if (!Number.isFinite(base) || !Number.isFinite(delta)) {
      throw new AuthorityError('Realm hand expected outcome cannot be derived');
    }
    const operation = rule.operation ?? 'add';
    if (operation !== 'add' && operation !== 'subtract') {
      throw new AuthorityError('Realm hand expected outcome operation is unsupported');
    }
    return [outputField, operation === 'subtract' ? base - delta : base + delta];
  }));
}

export function assertExpectedOutcome(hand, payload, observation, expectedOutcome) {
  const derived = deriveExpectedOutcome(hand, payload, observation);
  if (canonicalJson(derived) !== canonicalJson(expectedOutcome)) {
    throw new AuthorityError('decision expected outcome exceeds the Realm hand contract');
  }
  return derived;
}
